import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/labels";
import { notify } from "@/lib/services/notification-service";

/**
 * "Yeni cihazdan giriş" uyarısı. Her başarılı girişte cihaz kimliği kaydedilir; kişinin daha önce
 * hiç görülmemiş bir cihazdan girişi olursa (ilk giriş hariç) uygulama içi bildirim + e-posta gider:
 * şifresi çalınan kişi bunu hemen fark eder.
 *
 * Cihaz kimliği: web'de uzun ömürlü httpOnly çerez (`sc_device`), mobilde uygulamanın güvenli depoda
 * sakladığı rastgele kimlik. Kimlik gelmezse (eski mobil sürüm) tarayıcı bilgisi + kanaldan türetilir.
 * Veritabanında yalnızca özet (SHA-256) tutulur.
 */
export const DEVICE_COOKIE = "sc_device";
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // tarayıcıların izin verdiği en uzun süre (~400 gün)

export const newDeviceId = () => randomBytes(18).toString("base64url");

const hashOf = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Tarayıcının isteğe bağlı gönderdiği ek cihaz bilgisi (Client Hints: `Sec-CH-UA-Platform`,
 * `Sec-CH-UA-Platform-Version`, `Sec-CH-UA-Model`). Chrome/Edge gönderir; Safari/Firefox göndermez.
 * Not: tarayıcılar bilgisayarın marka/modelini hiçbir siteye vermez; telefonda (Android) model gelir.
 */
export type DeviceHints = { platform?: string | null; platformVersion?: string | null; model?: string | null };

const unquote = (v: string | null | undefined) => (v ?? "").replace(/^"|"$/g, "").trim();

export function hintsFromHeaders(headers: Headers): DeviceHints {
  return {
    platform: unquote(headers.get("sec-ch-ua-platform")) || null,
    platformVersion: unquote(headers.get("sec-ch-ua-platform-version")) || null,
    model: unquote(headers.get("sec-ch-ua-model")) || null,
  };
}

/** İşletim sistemi adı: Client Hints varsa sürümüyle (Windows 10/11 ayrımı yalnızca böyle yapılabilir). */
function osName(ua: string, hints: DeviceHints): string | null {
  const major = Number((hints.platformVersion ?? "").split(".")[0]);
  if (hints.platform === "Windows" && major > 0) return major >= 13 ? "Windows 11" : "Windows 10";
  if (hints.platform === "macOS" && major > 0) return `macOS ${major}`;
  if (hints.platform === "Android" && major > 0) return `Android ${major}`;
  const android = /Android (\d+)/i.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Android/i.test(ua)) return "Android";
  const ios = /(?:iPhone|CPU) OS (\d+)/i.exec(ua);
  if (/iPhone/i.test(ua)) return ios ? `iPhone · iOS ${ios[1]}` : "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

/**
 * Okunabilir cihaz adı: "Chrome · Windows 11", "Chrome · SM-S918B (Android 14)", "Safari · iPhone · iOS 18",
 * mobil uygulamada uygulamanın gönderdiği "Samsung SM-S918B · Android 14".
 */
export function deviceLabel(userAgent: string | null | undefined, channel: "Web" | "Mobil", hints: DeviceHints = {}, appDeviceName?: string | null): string {
  const ua = userAgent ?? "";
  if (channel === "Mobil") {
    const name = appDeviceName?.replace(/\s+/g, " ").trim().slice(0, 80);
    if (name) return `Mobil uygulama · ${name}`;
  }
  const os = osName(ua, hints);
  if (channel === "Web" && hints.model) {
    const browser = browserName(ua);
    return `${browser} · ${hints.model.slice(0, 40)}${os ? ` (${os})` : ""}`;
  }
  return legacyLabel(ua, channel, os);
}

function browserName(ua: string): string {
  return /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Tarayıcı";
}

function legacyLabel(ua: string, channel: "Web" | "Mobil", os: string | null): string {
  if (channel === "Mobil") return `Mobil uygulama${os ? ` · ${os}` : ""}`;
  const browser = browserName(ua);
  return os ? `${browser} · ${os}` : browser;
}

/** IP'yi okunur yapar: IPv6 içindeki IPv4 ("::ffff:1.2.3.4") sadeleşir, yerel adres "bu bilgisayar" olur. */
export function displayIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const plain = ip.replace(/^::ffff:/, "");
  return plain === "::1" || plain === "127.0.0.1" ? "bu bilgisayar (yerel)" : plain;
}

type LoginDevice = {
  userId: string;
  deviceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  channel: "Web" | "Mobil";
  /** Web: tarayıcının Client Hints başlıkları. */
  hints?: DeviceHints;
  /** Mobil: uygulamanın gönderdiği telefon adı/modeli. */
  appDeviceName?: string | null;
};

/** Başarılı girişten sonra çağrılır. Cihaz yeniyse (ve kişinin başka cihazı varsa) uyarı gönderir. */
export async function noteLoginDevice(input: LoginDevice): Promise<{ isNew: boolean; alerted: boolean }> {
  try {
    const raw = input.deviceId?.trim() || `ua:${input.channel}:${input.userAgent ?? ""}`;
    const deviceHash = hashOf(raw.slice(0, 500));
    const now = new Date();
    const existing = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId: input.userId, deviceHash } } });
    const label = deviceLabel(input.userAgent, input.channel, input.hints, input.appDeviceName);
    if (existing) {
      // Ad her girişte tazelenir (ör. tarayıcı güncellendi, Windows 11'e geçildi).
      await prisma.knownDevice.update({ where: { id: existing.id }, data: { lastSeenAt: now, lastIp: input.ip ?? existing.lastIp, label } });
      return { isNew: false, alerted: false };
    }
    const others = await prisma.knownDevice.count({ where: { userId: input.userId } });
    await prisma.knownDevice.create({ data: { userId: input.userId, deviceHash, label, channel: input.channel, lastIp: input.ip ?? null } });
    if (others === 0) return { isNew: true, alerted: false }; // ilk cihaz: uyarılacak bir şey yok

    await notify({
      type: "NEW_DEVICE_LOGIN",
      userIds: [input.userId],
      title: "Hesabına yeni bir cihazdan giriş yapıldı",
      body: [
        `${label} · ${formatDateTime(now)}`,
        "Sen değilsen şifreni değiştir ve Hesabım'dan tüm cihazlardan çıkış yap.",
      ].join("\n"),
      link: "/account#cihazlar",
    });
    return { isNew: true, alerted: true };
  } catch (error) {
    // Uyarı girişi asla engellemez.
    console.error("[cihaz] kaydedilemedi", error);
    return { isNew: false, alerted: false };
  }
}

export async function listDevices(userId: string) {
  return prisma.knownDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, label: true, channel: true, firstSeenAt: true, lastSeenAt: true, lastIp: true },
  });
}

/** Cihazı listeden çıkarır: o cihazdan bir sonraki giriş yeniden "yeni cihaz" sayılır. */
export async function forgetDevice(userId: string, deviceId: string) {
  const result = await prisma.knownDevice.deleteMany({ where: { id: deviceId, userId } });
  if (result.count === 0) throw new ApiError(404, "Cihaz bulunamadı");
}
