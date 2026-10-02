import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Zaman tabanlı tek kullanımlık şifre (TOTP, RFC 6238) — Google Authenticator, Microsoft
 * Authenticator, Authy gibi uygulamaların ürettiği 6 haneli kodlar. Harici kütüphane yok:
 * HMAC-SHA1, 30 saniyelik adım, 6 hane (uygulamaların varsayılanı).
 *
 * Bu dosya yalnızca node:crypto kullanır (testlerde ve Playwright'ta da doğrudan içe aktarılır).
 */
export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Geçersiz base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 bit rastgele gizli anahtar (base32; uygulamaya elle de girilebilir). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(time: number = Date.now()): number {
  return Math.floor(time / 1000 / TOTP_STEP_SECONDS);
}

/** Belirli bir zaman adımının kodu (RFC 4226 dinamik kesme). */
export function totpCode(secret: string, step: number, algorithm: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac(algorithm, base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Kodu doğrular. Telefon saatindeki küçük kaymalar için bir önceki ve bir sonraki 30 sn'lik adım da
 * kabul edilir. `lastStep` verilirse o adım ve öncesi reddedilir: aynı kod ikinci kez kullanılamaz
 * (ekran görüntüsü / omuz üstünden bakma ile tekrar oynatmaya karşı). Eşleşen adımı döner, yoksa null.
 */
export function verifyTotp(secret: string, code: string, options: { time?: number; lastStep?: number | null } = {}): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(options.time);
  for (const step of [current - 1, current, current + 1]) {
    if (options.lastStep !== undefined && options.lastStep !== null && step <= options.lastStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

/** Doğrulama uygulamasının QR koduyla okuduğu adres. */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/** Telefon kaybolursa giriş için tek kullanımlık kurtarma kodları ("ABCD-EFGH" biçiminde). */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)); // 8 karakter
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().replace(/[\s-]/g, "")).digest("hex");
}
