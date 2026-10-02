import { timingSafeEqual } from "node:crypto";

/**
 * Zamanlanmış görev uç noktalarının kimlik doğrulaması. Cron, kullanıcı oturumu değil
 * paylaşılan bir gizli anahtar taşır: `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron, CRON_SECRET ortam değişkeni tanımlıysa bu başlığı kendisi ekler).
 * Anahtar tanımlı değilse hiçbir istek kabul edilmez (güvenli varsayılan).
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // Uzunluk farklıysa timingSafeEqual hata verir; uzunluk zaten sızması zararsız bir bilgidir.
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
