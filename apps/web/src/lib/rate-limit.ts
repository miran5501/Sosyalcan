import { getRedis } from "@/lib/redis";

/**
 * Sabit pencereli sayaçlar: hatalı giriş kilidi ve genel API istek sınırı.
 *
 * Sayaçlar Redis'te tutulur (tüm sunucu örnekleri ve yeniden başlatmalar
 * arasında ortak). Redis tanımlı değilse ya da o an ulaşılamıyorsa aynı
 * mantık sunucu belleğinde çalışır; böylece Redis arızası girişi kilitlemez.
 */
export type CounterState = { count: number; resetAt: number };

export interface CounterStore {
  /** Sayacı bir artırır; pencere yoksa yenisini başlatır. */
  hit(key: string, windowMs: number): Promise<CounterState>;
  /** Sayacı değiştirmeden okur; süresi dolmuşsa null. */
  peek(key: string): Promise<CounterState | null>;
  clear(key: string): Promise<void>;
}

export function createMemoryStore(now: () => number = Date.now): CounterStore {
  const store = new Map<string, CounterState>();

  function live(key: string) {
    const entry = store.get(key);
    if (entry && entry.resetAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    async hit(key, windowMs) {
      const entry = live(key);
      if (entry) {
        entry.count += 1;
        return { ...entry };
      }
      if (store.size > 10_000) {
        for (const k of [...store.keys()]) live(k); // süresi dolanları temizle
      }
      const fresh = { count: 1, resetAt: now() + windowMs };
      store.set(key, fresh);
      return { ...fresh };
    },
    async peek(key) {
      const entry = live(key);
      return entry ? { ...entry } : null;
    },
    async clear(key) {
      store.delete(key);
    },
  };
}

const PREFIX = "sc:rl:";

/** Redis varsa onu, yoksa (veya hata verirse) bellek deposunu kullanan depo. */
export function createSharedStore(fallback: CounterStore = createMemoryStore()): CounterStore {
  return {
    async hit(key, windowMs) {
      const redis = getRedis();
      if (redis) {
        try {
          const result = await redis
            .multi()
            .incr(PREFIX + key)
            .pexpire(PREFIX + key, windowMs, "NX")
            .pttl(PREFIX + key)
            .exec();
          const count = Number(result?.[0]?.[1]);
          const ttl = Number(result?.[2]?.[1]);
          if (Number.isFinite(count) && ttl > 0) {
            return { count, resetAt: Date.now() + ttl };
          }
        } catch {
          // Redis'e ulaşılamadı: bellek deposuna düş.
        }
      }
      return fallback.hit(key, windowMs);
    },
    async peek(key) {
      const redis = getRedis();
      if (redis) {
        try {
          const result = await redis.multi().get(PREFIX + key).pttl(PREFIX + key).exec();
          const raw = result?.[0]?.[1];
          const ttl = Number(result?.[1]?.[1]);
          if (raw === null || raw === undefined || ttl <= 0) {
            return fallback.peek(key);
          }
          return { count: Number(raw), resetAt: Date.now() + ttl };
        } catch {
          // bellek deposuna düş
        }
      }
      return fallback.peek(key);
    },
    async clear(key) {
      const redis = getRedis();
      if (redis) {
        try {
          await redis.del(PREFIX + key);
        } catch {
          // bellek deposu yine de temizlenir
        }
      }
      await fallback.clear(key);
    },
  };
}

/**
 * Hatalı giriş denemelerini sınırlar (kaba kuvvet şifre denemesine karşı).
 * Yalnızca BAŞARISIZ denemeler sayılır; başarılı girişte sayaç sıfırlanır.
 */
export type FailureLimiter = ReturnType<typeof createFailureLimiter>;

export function createFailureLimiter(options: { max: number; windowMs: number; store: CounterStore; now?: () => number }) {
  const { max, windowMs, store, now = Date.now } = options;
  return {
    /** Anahtar kilitliyse kalan süre (ms), değilse 0. */
    async retryAfterMs(key: string): Promise<number> {
      const entry = await store.peek(key);
      return entry && entry.count >= max ? Math.max(0, entry.resetAt - now()) : 0;
    },
    async recordFailure(key: string) {
      await store.hit(key, windowMs);
    },
    async reset(key: string) {
      await store.clear(key);
    },
  };
}

/** Genel istek sınırı: pencere başına en fazla `max` istek. */
export function createRateLimiter(options: { max: number; windowMs: number; store: CounterStore; now?: () => number }) {
  const { max, windowMs, store, now = Date.now } = options;
  return {
    async consume(key: string): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
      const { count, resetAt } = await store.hit(key, windowMs);
      const allowed = count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - count),
        retryAfterMs: allowed ? 0 : Math.max(0, resetAt - now()),
      };
    },
  };
}

// Next.js route'ları, proxy ve Auth.js ayrı paketlenebildiği için örnekler globalThis'te tutulur.
const globalForLimiter = globalThis as unknown as {
  rateLimitStore?: CounterStore;
  loginLimiter?: FailureLimiter;
  accountLimiter?: FailureLimiter;
  apiLimiter?: ReturnType<typeof createRateLimiter>;
};
const sharedStore = (globalForLimiter.rateLimitStore ??= createSharedStore());

/** Aynı depoyu farklı sayaç aileleri için anahtar önekiyle ayırır. */
function prefixed(store: CounterStore, prefix: string): CounterStore {
  return {
    hit: (key, windowMs) => store.hit(prefix + key, windowMs),
    peek: (key) => store.peek(prefix + key),
    clear: (key) => store.clear(prefix + key),
  };
}

export const loginLimiter = (globalForLimiter.loginLimiter ??= createFailureLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000,
  store: prefixed(sharedStore, "login:"),
}));

/**
 * Hesap başına ikinci kilit: IP'den bağımsız. IP, x-forwarded-for başlığından okunduğu için
 * başlığı her denemede değiştiren biri yalnızca IP+e-posta kilidini atlatabilirdi; bu kilit
 * aynı hesaba 15 dakikada 20 hatalı denemeden sonra her yerden girişi durdurur.
 */
export const accountLimiter = (globalForLimiter.accountLimiter ??= createFailureLimiter({
  max: 20,
  windowMs: 15 * 60 * 1000,
  store: prefixed(sharedStore, "account:"),
}));

/** Giriş kilitliyse kalan süre (ms): iki kilitten uzun olanı. */
export async function loginLockMs(email: string, headers: Headers): Promise<number> {
  const [byIp, byAccount] = await Promise.all([
    loginLimiter.retryAfterMs(loginKey(email, headers)),
    accountLimiter.retryAfterMs(email.trim().toLowerCase()),
  ]);
  return Math.max(byIp, byAccount);
}

export async function recordLoginFailure(email: string, headers: Headers) {
  await Promise.all([
    loginLimiter.recordFailure(loginKey(email, headers)),
    accountLimiter.recordFailure(email.trim().toLowerCase()),
  ]);
}

export async function resetLoginFailures(email: string, headers: Headers) {
  await Promise.all([loginLimiter.reset(loginKey(email, headers)), accountLimiter.reset(email.trim().toLowerCase())]);
}

/** Tüm API istekleri: kullanıcı (ya da IP) başına dakikada 300 istek. */
export const apiLimiter = (globalForLimiter.apiLimiter ??= createRateLimiter({
  max: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 300,
  windowMs: 60 * 1000,
  store: prefixed(sharedStore, "api:"),
}));

/** İstemci IP'si (ters vekil arkasında x-forwarded-for'un ilk değeri). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "yerel";
}

/** Aynı kişinin aynı hesaba denemelerini birlikte sayar: istemci IP'si + e-posta. */
export function loginKey(email: string, headers: Headers): string {
  return `${clientIp(headers)}|${email.trim().toLowerCase()}`;
}

export function lockedMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return `Çok fazla hatalı deneme. Lütfen ${minutes} dakika sonra tekrar deneyin.`;
}
