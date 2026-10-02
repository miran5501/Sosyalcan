/**
 * Yedekleme betikleri için ortak yardımcı: DATABASE_URL'i ortamdan ya da .env'den okur ve
 * pg_dump/pg_restore'un anlayacağı biçime çevirir (Prisma'ya özel `?schema=` parametresi atılır).
 */
import { existsSync, readFileSync } from "node:fs";

export function databaseUrl() {
  let raw = process.env.DATABASE_URL;
  const envFile = new URL("../.env", import.meta.url);
  if (!raw && existsSync(envFile)) {
    raw = readFileSync(envFile, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1];
  }
  if (!raw) {
    console.error("DATABASE_URL bulunamadı (.env ya da ortam değişkeni).");
    process.exit(1);
  }
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url;
}

/** Aynı sunucuda başka bir veritabanının adresi (ör. geri yükleme denemesi için). */
export function withDatabase(url, name) {
  const copy = new URL(url);
  copy.pathname = `/${name}`;
  return copy;
}

export const dbName = (url) => decodeURIComponent(url.pathname.slice(1));
