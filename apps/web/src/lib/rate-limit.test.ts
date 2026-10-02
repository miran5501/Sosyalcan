import { describe, expect, it } from "vitest";
import {
  clientIp,
  createFailureLimiter,
  createMemoryStore,
  createRateLimiter,
  createSharedStore,
  loginKey,
  lockedMessage,
} from "./rate-limit";

function clock() {
  let time = 1_000_000;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

function setup(max = 3, windowMs = 60_000) {
  const { now, advance } = clock();
  const limiter = createFailureLimiter({ max, windowMs, now, store: createMemoryStore(now) });
  return { limiter, advance };
}

describe("createFailureLimiter", () => {
  it("limit dolana kadar kilitlemez", async () => {
    const { limiter } = setup(3);
    await limiter.recordFailure("a");
    await limiter.recordFailure("a");
    expect(await limiter.retryAfterMs("a")).toBe(0);
  });

  it("limit dolunca kalan süreyi döner", async () => {
    const { limiter, advance } = setup(3, 60_000);
    for (let i = 0; i < 3; i++) await limiter.recordFailure("a");
    expect(await limiter.retryAfterMs("a")).toBe(60_000);
    advance(20_000);
    expect(await limiter.retryAfterMs("a")).toBe(40_000);
  });

  it("süre dolunca kilit açılır ve sayaç baştan başlar", async () => {
    const { limiter, advance } = setup(2, 60_000);
    await limiter.recordFailure("a");
    await limiter.recordFailure("a");
    advance(60_001);
    expect(await limiter.retryAfterMs("a")).toBe(0);
    await limiter.recordFailure("a");
    expect(await limiter.retryAfterMs("a")).toBe(0);
  });

  it("başarılı girişte reset sayaçı sıfırlar", async () => {
    const { limiter } = setup(2);
    await limiter.recordFailure("a");
    await limiter.reset("a");
    await limiter.recordFailure("a");
    expect(await limiter.retryAfterMs("a")).toBe(0);
  });

  it("anahtarlar birbirinden bağımsızdır", async () => {
    const { limiter } = setup(1);
    await limiter.recordFailure("a");
    expect(await limiter.retryAfterMs("a")).toBeGreaterThan(0);
    expect(await limiter.retryAfterMs("b")).toBe(0);
  });
});

describe("createRateLimiter", () => {
  it("pencere içinde max isteğe izin verir, fazlasını reddeder", async () => {
    const { now, advance } = clock();
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now, store: createMemoryStore(now) });
    expect((await limiter.consume("u")).allowed).toBe(true);
    const second = await limiter.consume("u");
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    const third = await limiter.consume("u");
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBe(60_000);
    advance(60_001);
    expect((await limiter.consume("u")).allowed).toBe(true);
  });
});

describe("createSharedStore", () => {
  it("Redis yokken bellek deposuna düşer", async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const store = createSharedStore();
      await store.hit("x", 60_000);
      const state = await store.hit("x", 60_000);
      expect(state.count).toBe(2);
      await store.clear("x");
      expect(await store.peek("x")).toBeNull();
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
  });
});

describe("loginKey", () => {
  it("IP ve küçük harfli e-postayı birleştirir", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.5, 172.16.0.1" });
    expect(loginKey("  Admin@Sosyalcan.local ", headers)).toBe("10.0.0.5|admin@sosyalcan.local");
  });

  it("IP başlığı yoksa yerel kullanır", () => {
    expect(loginKey("a@b.co", new Headers())).toBe("yerel|a@b.co");
  });

  it("x-real-ip başlığını da tanır", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
  });
});

describe("lockedMessage", () => {
  it("süreyi yukarı yuvarlanmış dakikayla yazar", () => {
    expect(lockedMessage(61_000)).toContain("2 dakika");
    expect(lockedMessage(1_000)).toContain("1 dakika");
  });
});
