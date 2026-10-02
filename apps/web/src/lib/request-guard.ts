import { createHash } from "node:crypto";
import { clientIp } from "@/lib/rate-limit";

/**
 * Proxy'de (her istekten önce) çalışan saf kontroller; test edilebilsin diye ayrı dosyada.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF koruması: çerezle kimlik doğrulanan bir API isteği başka bir siteden
 * tetiklenmiş mi? Tarayıcılar POST/PATCH/DELETE isteklerinde `Origin` başlığını
 * gönderir; bizim alan adımızla eşleşmiyorsa istek reddedilir.
 *
 * Bearer token'lı istekler (mobil, cron) muaf: tarayıcı bu başlığı başka siteye
 * kendiliğinden eklemez, yani CSRF ile taşınamaz. Origin'i hiç olmayan istekler
 * (sunucudan sunucuya, curl) yalnızca tarayıcı "cross-site" demiyorsa kabul edilir.
 * Server action'lar için Next.js aynı kontrolü zaten kendisi yapar.
 */
export function isCrossSiteApiMutation(request: Request): boolean {
  const url = new URL(request.url);
  if (!MUTATING.has(request.method) || !url.pathname.startsWith("/api/")) {
    return false;
  }
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return request.headers.get("sec-fetch-site") === "cross-site";
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Genel istek sınırı anahtarı: aynı kişinin istekleri birlikte sayılır.
 * Bearer token ya da oturum çerezi varsa onun özeti (aynı ofisteki kullanıcılar
 * tek IP'yi paylaşsa da birbirinin limitini yemez), yoksa IP.
 */
export function rateLimitKey(request: Request): string {
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie") ?? "";
  const session = /(?:^|;\s*)(?:__Secure-)?authjs\.session-token(?:\.0)?=([^;]+)/.exec(cookie)?.[1];
  const credential = authorization?.startsWith("Bearer ") ? authorization.slice(7) : session;
  if (credential) {
    return "c:" + createHash("sha256").update(credential).digest("hex").slice(0, 32);
  }
  return "ip:" + clientIp(request.headers);
}
