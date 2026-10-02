import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Veritabanında şifreli saklanması gereken küçük gizli değerler (ör. 2FA anahtarı).
 * AES-256-GCM; anahtar AUTH_SECRET'tan türetilir. Veritabanı sızsa bile 2FA anahtarları okunamaz.
 *
 * Not: AUTH_SECRET değiştirilirse eski şifreli değerler çözülemez; 2FA kullananların 2FA'sı
 * Admin tarafından sıfırlanıp yeniden kurulmalıdır.
 */
function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET tanımlı değil");
  return createHash("sha256").update(`sosyalcan-secret-box:${secret}`).digest();
}

/** "v1.<iv>.<etiket>.<şifreli>" (base64url). */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Geçersiz şifreli değer");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
