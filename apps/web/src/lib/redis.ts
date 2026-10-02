import { Redis } from "ioredis";

/**
 * Paylaşılan Redis bağlantısı (rate limit sayaçları + önbellek).
 *
 * Redis isteğe bağlıdır: `REDIS_URL` tanımlı değilse ya da sunucuya o an
 * ulaşılamıyorsa `getRedis()` null döner ve çağıran taraf belleğe/önbelleksiz
 * çalışmaya düşer. Böylece Redis çökse bile uygulama ayakta kalır; yalnızca
 * sayaçlar o sunucu örneğine özel hâle gelir.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis | null; redisWarned?: boolean };

function createClient(): Redis | null {
  const url = process.env.REDIS_URL;
  // Testler veritabanını her seferinde sıfırlar; ortak Redis'teki önbellek/sayaç onları bozmasın.
  if (!url || process.env.NODE_ENV === "test") {
    return null;
  }
  const client = new Redis(url, {
    // Bağlı değilken komutlar kuyrukta beklemesin, hemen hata versin (istek takılmasın).
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  client.on("error", (error) => {
    if (!globalForRedis.redisWarned) {
      globalForRedis.redisWarned = true;
      console.warn(`[redis] bağlantı kurulamadı, bellek yedeğine düşülüyor: ${error.message}`);
    }
  });
  client.on("ready", () => {
    globalForRedis.redisWarned = false;
  });
  return client;
}

/** Hazır bir Redis bağlantısı varsa onu, yoksa null döner. */
export function getRedis(): Redis | null {
  if (globalForRedis.redis === undefined) {
    globalForRedis.redis = createClient();
  }
  const client = globalForRedis.redis;
  return client && client.status === "ready" ? client : null;
}

/** Sağlık kontrolü için: "disabled" (REDIS_URL yok), "ok" ya da "down". */
export async function redisHealth(): Promise<"disabled" | "ok" | "down"> {
  if (!process.env.REDIS_URL) {
    return "disabled";
  }
  getRedis(); // bağlantıyı başlat
  const client = globalForRedis.redis;
  if (!client || client.status !== "ready") {
    return "down";
  }
  try {
    return (await client.ping()) === "PONG" ? "ok" : "down";
  } catch {
    return "down";
  }
}
