import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail } from "@/lib/email";
import { createRateLimiter, createSharedStore } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/services/user-service";

/**
 * "Şifremi unuttum": e-postaya tek kullanımlık, 30 dakika geçerli bir sıfırlama bağlantısı.
 *
 * - Yanıt her durumda aynıdır ("kayıtlıysa e-posta gönderildi"): e-postanın sistemde olup olmadığı anlaşılamaz.
 * - Veritabanında bağlantının kendisi değil SHA-256 özeti tutulur.
 * - Aynı adrese saatte en fazla 3 istek (başkasının e-postasını doldurmaya karşı).
 * - Yeni istek eskileri geçersiz kılar; şifre değişince tüm oturumlar kapanır.
 */
export const RESET_TTL_MINUTES = 30;

const globalForReset = globalThis as unknown as { resetLimiter?: ReturnType<typeof createRateLimiter> };
const limiter = (globalForReset.resetLimiter ??= createRateLimiter({ max: 3, windowMs: 60 * 60 * 1000, store: createSharedStore() }));

export const hashResetToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** İsteği işler. Dönen değer yalnızca testler içindir; arayüz her durumda aynı mesajı gösterir. */
export async function requestPasswordReset(emailInput: string, ip: string | null): Promise<"sent" | "ignored" | "limited"> {
  const email = emailInput.trim().toLowerCase();
  if (!(await limiter.consume(`reset:${email}`)).allowed) return "limited";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.disabledAt || user.anonymizedAt) {
    await audit({ action: "PASSWORD_RESET_REQUESTED", summary: `${email} (kayıtlı değil / kapalı)`, ip });
    return "ignored";
  }
  const raw = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(raw), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000), ip },
    }),
  ]);
  await sendEmail({
    to: user.email,
    subject: "SosyalCan şifre sıfırlama",
    sensitive: true,
    text: [
      `Merhaba ${user.name},`,
      "",
      "Şifreni sıfırlamak için aşağıdaki bağlantıyı aç. Bağlantı 30 dakika geçerlidir ve yalnızca bir kez kullanılabilir.",
      "",
      appUrl(`/reset-password?token=${raw}`),
      "",
      "Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.",
    ].join("\n"),
  });
  await audit({ action: "PASSWORD_RESET_REQUESTED", userId: user.id, ip });
  return "sent";
}

/** Bağlantı hâlâ geçerli mi (sayfa açılırken kontrol için). */
export async function isResetTokenValid(raw: string | undefined) {
  if (!raw) return false;
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(raw) }, include: { user: true } });
  return Boolean(token && !token.usedAt && token.expiresAt > new Date() && !token.user.disabledAt);
}

/** Yeni şifreyi kaydeder. Geçersiz/süresi dolmuş/kullanılmış bağlantıda false. */
export async function resetPassword(raw: string, newPassword: string, ip: string | null): Promise<boolean> {
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(raw) }, include: { user: true } });
  if (!token || token.usedAt || token.expiresAt <= new Date() || token.user.disabledAt) return false;
  // Tek kullanımlık: aynı bağlantıyla eşzamanlı iki istekten yalnızca biri geçer.
  const claimed = await prisma.passwordResetToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) return false;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: token.userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ action: "PASSWORD_RESET_COMPLETED", userId: token.userId, ip });
  return true;
}
