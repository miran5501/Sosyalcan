import { SignJWT, jwtVerify } from "jose";

/**
 * Giriş akışının sunucu içi, kısa ömürlü belirteçleri:
 * - "login": şifre (ve gerekiyorsa 2FA) doğrulandı; Auth.js oturumu bununla açılır (60 sn, tarayıcıya hiç gitmez).
 * - "2fa-web": şifre doğru, kod bekleniyor (httpOnly çerezde, 5 dk).
 * - "2fa-mobile": aynısı mobil için (yanıtta döner, 5 dk).
 * Amaç (purpose) imzanın içinde: biri diğerinin yerine kullanılamaz.
 */
export type LoginTokenPurpose = "login" | "2fa-web" | "2fa-mobile";
const AUDIENCE = "sosyalcan-login";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET tanımlı değil");
  return new TextEncoder().encode(secret);
}

export async function signLoginToken(userId: string, purpose: LoginTokenPurpose, ttlSeconds: number) {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

/** Geçerliyse kullanıcı kimliği, değilse (süre, imza, amaç) null. */
export async function verifyLoginToken(token: string | undefined | null, purpose: LoginTokenPurpose): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], audience: AUDIENCE });
    return payload.purpose === purpose && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
