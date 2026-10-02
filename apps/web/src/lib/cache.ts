import { getRedis } from "@/lib/redis";

/**
 * Redis önbelleği: sık okunup seyrek değişen veriler (seçenek listeleri, ajans
 * ayarları) her sayfa açılışında veritabanından okunmasın.
 *
 * Geçersiz kılma "etiket sürümü" ile yapılır: her etiketin bir sürüm sayacı
 * vardır ve anahtar bu sürümü içerir. Veri değişince sayaç artar, eski
 * anahtarlar bir daha okunmaz ve süreleri dolunca Redis'ten kendiliğinden düşer.
 * Etiketler, ilgili tablo değişince Prisma katmanında otomatik geçersiz kılınır
 * (lib/prisma.ts), yani bir servisin cache'i temizlemeyi unutması mümkün değil.
 *
 * Redis yoksa önbellek devre dışıdır: her çağrı doğrudan veritabanına gider.
 */
export type CacheTag = "options" | "agency";

const PREFIX = "sc:cache:";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** JSON'a dönüşen Date alanlarını geri Date yapar (Prisma sonuçları Date içerir). */
function reviveDates(_key: string, value: unknown) {
  return typeof value === "string" && ISO_DATE.test(value) ? new Date(value) : value;
}

async function tagVersion(tag: CacheTag): Promise<string> {
  const redis = getRedis();
  return (await redis?.get(`${PREFIX}ver:${tag}`)) ?? "0";
}

export async function cached<T>(tag: CacheTag, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) {
    return load();
  }
  let fullKey: string | null = null;
  try {
    fullKey = `${PREFIX}${tag}:v${await tagVersion(tag)}:${key}`;
    const hit = await redis.get(fullKey);
    if (hit !== null) {
      return JSON.parse(hit, reviveDates) as T;
    }
  } catch {
    return load(); // Redis o an yanıt vermiyor: önbelleksiz devam.
  }
  const value = await load();
  try {
    await redis.set(fullKey, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // yazılamadıysa bir sonraki istekte tekrar denenir
  }
  return value;
}

export async function invalidateCache(tag: CacheTag): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  try {
    await redis.incr(`${PREFIX}ver:${tag}`);
  } catch {
    // Redis'e ulaşılamadı: anahtarlar en geç TTL dolunca yenilenir.
  }
}

/** Hangi tablo değişince hangi önbellek etiketi geçersiz olur. */
export const CACHE_TAGS_BY_MODEL: Record<string, CacheTag> = {
  OptionItem: "options",
  AgencySettings: "agency",
};
