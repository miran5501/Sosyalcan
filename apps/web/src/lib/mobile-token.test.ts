import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { signMobileToken, verifyMobileToken } from "./mobile-token";

const SECRET = "test-secret-en-az-32-karakter-uzunlugunda";
const key = () => new TextEncoder().encode(SECRET);

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});

describe("mobil token", () => {
  it("imzalanan token kullanıcı id'sine ve oturum sürümüne geri çözülür", async () => {
    const token = await signMobileToken("user-123", 4);
    expect(await verifyMobileToken(token)).toEqual({ userId: "user-123", sessionVersion: 4 });
  });

  it("access token 15 dakikada dolar", async () => {
    const token = await signMobileToken("user-123");
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("değiştirilmiş token reddedilir", async () => {
    const token = await signMobileToken("user-123");
    const tampered = token.slice(0, -3) + (token.endsWith("aaa") ? "bbb" : "aaa");
    expect(await verifyMobileToken(tampered)).toBeNull();
  });

  it("çöp metin reddedilir", async () => {
    expect(await verifyMobileToken("bu-bir-token-degil")).toBeNull();
  });

  it("başka anahtarla imzalanan token reddedilir", async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setAudience("sosyalcan-mobile")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("baska-bir-anahtar-baska-bir-anahtar"));
    expect(await verifyMobileToken(forged)).toBeNull();
  });

  it("süresi dolmuş token reddedilir", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setAudience("sosyalcan-mobile")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(key());
    expect(await verifyMobileToken(expired)).toBeNull();
  });

  it("yanlış audience'lı token reddedilir", async () => {
    const wrongAudience = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setAudience("baska-istemci")
      .setExpirationTime("1h")
      .sign(key());
    expect(await verifyMobileToken(wrongAudience)).toBeNull();
  });
});
