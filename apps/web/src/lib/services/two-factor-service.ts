import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { TwoFactorMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { audit } from "@/lib/audit";
import { emailMode, sendEmail } from "@/lib/email";
import { open, seal } from "@/lib/secret-box";
import { createFailureLimiter, createSharedStore } from "@/lib/rate-limit";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, verifyTotp } from "@/lib/totp";
import { verifyCredentials } from "@/lib/services/user-service";

/**
 * İki adımlı doğrulama (2FA): şifreye ek olarak ikinci bir kanıt. İki yöntem var:
 * - APP: telefondaki doğrulama uygulamasının 6 haneli kodu (TOTP),
 * - EMAIL: girişte kişinin e-postasına gönderilen 6 haneli, 10 dakika geçerli, tek kullanımlık kod.
 * Şifre çalınsa bile hesaba girilemez. Telefon / e-posta erişimi kaybolursa tek kullanımlık kurtarma kodları.
 */
const ISSUER = "SosyalCan";
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;

// Kod denemesi kaba kuvvete karşı sınırlı: kullanıcı başına 15 dk'da 5 hatalı kod.
// E-posta kodu gönderimi de sınırlı: kullanıcı başına 15 dk'da 5 e-posta (gelen kutusu boğulmasın).
const globalFor2fa = globalThis as unknown as {
  twoFactorLimiter?: ReturnType<typeof createFailureLimiter>;
  emailCodeLimiter?: ReturnType<typeof createFailureLimiter>;
};
const limiter = (globalFor2fa.twoFactorLimiter ??= createFailureLimiter({ max: 5, windowMs: 15 * 60 * 1000, store: createSharedStore() }));
const sendLimiter = (globalFor2fa.emailCodeLimiter ??= createFailureLimiter({ max: 5, windowMs: 15 * 60 * 1000, store: createSharedStore() }));

async function getUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.disabledAt) throw new ApiError(404, "Kullanıcı bulunamadı");
  return user;
}

/** "ayse.kaya@ajans.com" → "ay•••@ajans.com": ekranda hangi adrese kod gittiğini ipucu olarak gösterir. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}•••@${domain ?? ""}`;
}

/**
 * E-postayla doğrulama kullanılabilir mi? Gerçek e-posta (SMTP) kuruluysa her zaman; geliştirme modunda
 * (e-posta yalnızca giden kutusuna yazılır) yalnızca geliştirme ortamında. Canlıda SMTP yokken açılırsa
 * kimse koduna ulaşamaz ve hesabından kilitlenir. Tarayıcı testleri / demo kurulumu üretim derlemesiyle
 * çalıştığı için `EMAIL_2FA_WITHOUT_SMTP=true` ile bilinçli olarak açılabilir (kodlar giden kutusunda kalır).
 */
export function emailTwoFactorAvailable(): boolean {
  return emailMode() === "smtp" || process.env.NODE_ENV !== "production" || process.env.EMAIL_2FA_WITHOUT_SMTP === "true";
}

export async function twoFactorStatus(userId: string) {
  const user = await getUser(userId);
  return {
    enabled: Boolean(user.twoFactorEnabledAt),
    method: user.twoFactorEnabledAt ? (user.twoFactorMethod ?? "APP") : null,
    enabledAt: user.twoFactorEnabledAt,
    recoveryCodesLeft: user.recoveryCodes.length,
    email: maskEmail(user.email),
    emailAvailable: emailTwoFactorAvailable(),
    emailDevMode: emailMode() === "dev",
  };
}

// --- E-posta kodu ---

function hashEmailCode(userId: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET tanımlı değil");
  return createHmac("sha256", `sosyalcan-email-otp:${secret}`).update(`${userId}:${code}`).digest("hex");
}

const REASON_TEXT = {
  login: "SosyalCan'a giriş yapmak",
  setup: "e-postayla iki adımlı doğrulamayı açmak",
  confirm: "iki adımlı doğrulama ayarını değiştirmek",
} as const;

/**
 * Kişinin e-postasına yeni bir 6 haneli kod gönderir (öncekini geçersiz kılar). Gönderim sınırına
 * takılırsa "limited" döner; o durumda daha önce gönderilen kod geçerliliğini korur.
 */
export async function sendEmailCode(userId: string, reason: keyof typeof REASON_TEXT): Promise<"sent" | "limited"> {
  const user = await getUser(userId);
  const key = `2fa-mail:${userId}`;
  if ((await sendLimiter.retryAfterMs(key)) > 0) return "limited";
  await sendLimiter.recordFailure(key);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.user.update({
    where: { id: userId },
    data: { emailOtpHash: hashEmailCode(userId, code), emailOtpExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS) },
  });
  await sendEmail({
    to: user.email,
    subject: `SosyalCan doğrulama kodu: ${code}`,
    sensitive: true,
    text: [
      `Merhaba ${user.name},`,
      "",
      `${REASON_TEXT[reason]} için doğrulama kodun:`,
      "",
      `    ${code}`,
      "",
      "Kod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir.",
      "Bu isteği sen yapmadıysan şifren başkasının elinde olabilir: hemen şifreni değiştir ve yöneticine haber ver.",
    ].join("\n"),
  });
  return "sent";
}

/** E-posta kodunu kontrol eder; doğruysa kodu siler (ikinci kez kullanılamaz). */
async function consumeEmailCode(user: { id: string; emailOtpHash: string | null; emailOtpExpiresAt: Date | null }, code: string): Promise<boolean> {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits) || !user.emailOtpHash || !user.emailOtpExpiresAt || user.emailOtpExpiresAt.getTime() < Date.now()) {
    return false;
  }
  const expected = Buffer.from(user.emailOtpHash, "hex");
  const actual = Buffer.from(hashEmailCode(user.id, digits), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  // Koşullu silme: aynı kodla aynı anda gelen iki istekten yalnızca biri geçer.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, emailOtpHash: user.emailOtpHash },
    data: { emailOtpHash: null, emailOtpExpiresAt: null },
  });
  return claimed.count === 1;
}

// --- Kurulum ---

/**
 * Kurulumu başlatır.
 * APP: yeni anahtar (henüz etkin değil) + QR kod. EMAIL: kişinin adresine kod gönderilir
 * (adresin gerçekten ona ait ve ulaşılabilir olduğu böylece kanıtlanır).
 */
export async function startSetup(userId: string, method: TwoFactorMethod = "APP") {
  const user = await getUser(userId);
  if (user.twoFactorEnabledAt) throw new ApiError(409, "İki adımlı doğrulama zaten açık");
  if (method === "EMAIL") {
    if (!emailTwoFactorAvailable()) {
      throw new ApiError(400, "E-posta gönderimi henüz kurulu değil. Yönetici e-posta ayarını (SMTP) yapınca bu yöntem açılabilir.");
    }
    const sent = await sendEmailCode(userId, "setup");
    if (sent === "limited") throw new ApiError(429, "Çok fazla kod istendi. 15 dakika sonra tekrar dene.");
    return { method, email: maskEmail(user.email) };
  }
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpPendingSecret: seal(secret) } });
  const url = otpauthUrl(secret, user.email, ISSUER);
  return { method, secret, otpauthUrl: url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

/** İlk kod doğrulanınca 2FA açılır; kurtarma kodları bir kez gösterilmek üzere döner. */
export async function confirmSetup(userId: string, code: string, method: TwoFactorMethod = "APP") {
  const user = await getUser(userId);
  if (user.twoFactorEnabledAt) throw new ApiError(409, "İki adımlı doğrulama zaten açık");
  const recoveryCodes = generateRecoveryCodes();
  const enable = { twoFactorEnabledAt: new Date(), twoFactorMethod: method, recoveryCodes: recoveryCodes.map(hashRecoveryCode) };

  if (method === "EMAIL") {
    if (!(await consumeEmailCode(user, code))) throw new ApiError(400, "Kod hatalı ya da süresi dolmuş. Yeni kod isteyebilirsin.");
    await prisma.user.update({ where: { id: userId }, data: { ...enable, totpSecret: null, totpPendingSecret: null, totpLastStep: null } });
    return { recoveryCodes };
  }

  if (!user.totpPendingSecret) throw new ApiError(400, "Önce kurulumu başlatın");
  const step = verifyTotp(open(user.totpPendingSecret), code);
  if (step === null) throw new ApiError(400, "Kod hatalı. Telefonun saatinin doğru olduğundan emin olup yeni kodu girin.");
  await prisma.user.update({
    where: { id: userId },
    data: { ...enable, totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpLastStep: step },
  });
  return { recoveryCodes };
}

// --- Giriş ---

/**
 * Girişte ikinci adım: hesabın yöntemine göre uygulama kodu ya da e-posta kodu; her iki yöntemde
 * kurtarma kodu da geçer (kullanılınca listeden düşer). Hatalı denemeler sınırlıdır ve denetim kaydına yazılır.
 */
export async function verifySecondFactor(userId: string, code: string, ip: string | null): Promise<{ ok: true; usedRecovery: boolean } | { ok: false; locked: boolean }> {
  const key = `2fa:${userId}`;
  if ((await limiter.retryAfterMs(key)) > 0) return { ok: false, locked: true };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.disabledAt || !user.twoFactorEnabledAt) return { ok: false, locked: false };

  if (user.twoFactorMethod === "EMAIL") {
    if (await consumeEmailCode(user, code)) {
      await limiter.reset(key);
      return { ok: true, usedRecovery: false };
    }
  } else if (user.totpSecret) {
    const step = verifyTotp(open(user.totpSecret), code, { lastStep: user.totpLastStep });
    if (step !== null) {
      await prisma.user.update({ where: { id: userId }, data: { totpLastStep: step } });
      await limiter.reset(key);
      return { ok: true, usedRecovery: false };
    }
  }
  const hash = hashRecoveryCode(code);
  if (code.replace(/[\s-]/g, "").length === 8 && user.recoveryCodes.includes(hash)) {
    await prisma.user.update({ where: { id: userId }, data: { recoveryCodes: user.recoveryCodes.filter((h) => h !== hash) } });
    await limiter.reset(key);
    return { ok: true, usedRecovery: true };
  }
  await limiter.recordFailure(key);
  await audit({ action: "TWO_FACTOR_FAILED", userId, ip });
  return { ok: false, locked: (await limiter.retryAfterMs(key)) > 0 };
}

/** Giriş sırasında e-posta kodunu yeniden gönderir (yalnızca e-posta yöntemindeki hesaplar). */
export async function resendLoginCode(userId: string): Promise<"sent" | "limited" | "not-email"> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.disabledAt || !user.twoFactorEnabledAt || user.twoFactorMethod !== "EMAIL") return "not-email";
  return sendEmailCode(userId, "login");
}

// --- Yönetim ---

/** Hesabım'da kapatma / kurtarma kodu yenileme öncesi e-posta yöntemindeki kişiye kod gönderir. */
export async function sendManagementCode(userId: string) {
  const user = await getUser(userId);
  if (!user.twoFactorEnabledAt || user.twoFactorMethod !== "EMAIL") throw new ApiError(400, "Bu hesap e-postayla doğrulama kullanmıyor");
  if ((await sendEmailCode(userId, "confirm")) === "limited") throw new ApiError(429, "Çok fazla kod istendi. 15 dakika sonra tekrar dene.");
  return { email: maskEmail(user.email) };
}

/** Kişi kendi 2FA'sını kapatır: şifre + geçerli kod (ya da kurtarma kodu) ister. */
export async function disableTwoFactor(userId: string, password: string, code: string, ip: string | null) {
  const user = await getUser(userId);
  if (!user.twoFactorEnabledAt) throw new ApiError(400, "İki adımlı doğrulama zaten kapalı");
  if (!(await verifyCredentials(user.email, password))) throw new ApiError(400, "Şifre hatalı");
  const second = await verifySecondFactor(userId, code, ip);
  if (!second.ok) throw new ApiError(400, second.locked ? "Çok fazla hatalı kod. 15 dakika sonra deneyin." : "Kod hatalı");
  await clearTwoFactor(userId);
}

/** Yeni kurtarma kodları (eskiler geçersiz olur). Geçerli bir kod ister. */
export async function regenerateRecoveryCodes(userId: string, code: string, ip: string | null) {
  const user = await getUser(userId);
  if (!user.twoFactorEnabledAt) throw new ApiError(400, "İki adımlı doğrulama kapalı");
  const second = await verifySecondFactor(userId, code, ip);
  if (!second.ok) throw new ApiError(400, second.locked ? "Çok fazla hatalı kod. 15 dakika sonra deneyin." : "Kod hatalı");
  const recoveryCodes = generateRecoveryCodes();
  await prisma.user.update({ where: { id: userId }, data: { recoveryCodes: recoveryCodes.map(hashRecoveryCode) } });
  return { recoveryCodes };
}

/** 2FA'yı tamamen kaldırır (kişinin kendisi ya da telefonunu / e-postasını kaybeden kişi için Admin). */
export async function clearTwoFactor(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: null,
      totpPendingSecret: null,
      twoFactorEnabledAt: null,
      twoFactorMethod: null,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      totpLastStep: null,
      recoveryCodes: [],
    },
  });
}
