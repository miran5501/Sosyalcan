import { beforeAll, describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUrl,
  stepAt,
  totpCode,
  verifyTotp,
} from "./totp";
import { open, seal } from "./secret-box";

// RFC 6238 Ek B: anahtar "12345678901234567890" (ASCII), 8 hanelik kodların son 6 hanesi.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("RFC'nin resmi test değerlerini üretir", () => {
    // zaman (sn) → beklenen 8 hanelik kodun son 6 hanesi
    const vectors: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
    ];
    for (const [seconds, expected] of vectors) {
      expect(totpCode(RFC_SECRET, Math.floor(seconds / 30))).toBe(expected);
    }
  });

  it("base32 gidiş-dönüş", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("bir önceki/sonraki adımı kabul eder, daha uzağını ve yanlış kodu reddeder", () => {
    const secret = generateTotpSecret();
    const now = 1_790_000_000_000;
    const step = stepAt(now);
    expect(verifyTotp(secret, totpCode(secret, step), { time: now })).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), { time: now })).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), { time: now })).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step - 3), { time: now })).toBeNull();
    expect(verifyTotp(secret, "12345", { time: now })).toBeNull();
    expect(verifyTotp(secret, "abcdef", { time: now })).toBeNull();
  });

  it("aynı kod ikinci kez kullanılamaz (son kullanılan adım ve öncesi reddedilir)", () => {
    const secret = generateTotpSecret();
    const now = 1_790_000_000_000;
    const code = totpCode(secret, stepAt(now));
    const used = verifyTotp(secret, code, { time: now })!;
    expect(verifyTotp(secret, code, { time: now, lastStep: used })).toBeNull();
  });

  it("otpauth adresi ve kurtarma kodları", () => {
    expect(otpauthUrl("ABC", "ayse@x.co", "SosyalCan")).toBe(
      "otpauth://totp/SosyalCan%3Aayse%40x.co?secret=ABC&issuer=SosyalCan&algorithm=SHA1&digits=6&period=30",
    );
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect(hashRecoveryCode(codes[0].toLowerCase().replace("-", " "))).toBe(hashRecoveryCode(codes[0]));
  });
});

describe("secret-box (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-en-az-32-karakter-uzunlugunda";
  });

  it("şifreler ve çözer; her seferinde farklı şifreli metin üretir; kurcalanırsa çözmez", () => {
    const a = seal("JBSWY3DPEHPK3PXP");
    const b = seal("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(a).not.toContain("JBSWY3DP");
    expect(open(a)).toBe("JBSWY3DPEHPK3PXP");
    const parts = a.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(() => open(parts.join("."))).toThrow();
  });
});
