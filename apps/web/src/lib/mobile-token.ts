import { SignJWT, jwtVerify } from "jose";

/**
 * Mobil istemci için kısa ömürlü erişim (access) token'ı. Web, Auth.js'in
 * çerez tabanlı oturumunu kullanır; React Native tarafında giriş yapınca
 * imzalı bir JWT ile birlikte uzun ömürlü bir yenileme (refresh) token'ı
 * alınır (bkz. session-service.ts). Access token her istekte
 * `Authorization: Bearer <token>` ile gönderilir ve 15 dakikada dolar;
 * süresi dolunca uygulama refresh token ile sessizce yenisini alır.
 *
 * Token yalnızca kimliği (sub) ve oturum sürümünü (sv) taşır; rol ve
 * devre dışı durumu her istekte veritabanından okunur (api-auth.ts).
 * Şifre değişince sessionVersion artar ve eski token'lar anında geçersiz olur.
 */
// Varsayılan 15 dk; yalnızca yenileme akışını denemek için ortam değişkeniyle kısaltılabilir.
export const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.MOBILE_ACCESS_TOKEN_TTL_SECONDS) || 15 * 60;
const AUDIENCE = "sosyalcan-mobile";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET tanımlı değil");
  }
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(userId: string, sessionVersion = 0): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Geçerli token'ın kullanıcı id'si ve oturum sürümü; imza/süre/audience hatasında null. */
export async function verifyMobileToken(token: string): Promise<{ userId: string; sessionVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: AUDIENCE,
    });
    if (!payload.sub) {
      return null;
    }
    return { userId: payload.sub, sessionVersion: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}
