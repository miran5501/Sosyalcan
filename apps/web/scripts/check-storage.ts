/**
 * Dosya depolama ayarını dener: `npm run storage:check`
 * Ayarlardaki depolamaya küçük bir deneme dosyası yazar, geri okur ve siler. S3 ayarları
 * (STORAGE_DRIVER=s3, S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
 * .env dosyasından ya da ortamdan okunur.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  const { deleteObject, getObject, putObject, storageStatus } = await import("../src/lib/storage");

  const status = storageStatus();
  if (!status.enabled) {
    console.error(`Depolama kapalı: ${status.reason}`);
    process.exit(1);
  }
  console.log(`Sürücü: ${status.driver}${status.driver === "s3" ? ` · ${process.env.S3_ENDPOINT} · kova ${process.env.S3_BUCKET}` : ""}`);

  const key = `storage-check/${Date.now()}-${randomBytes(4).toString("hex")}.txt`;
  const body = Buffer.from(`SosyalCan depolama denemesi ${new Date().toISOString()}`);
  try {
    await putObject(key, body, "text/plain");
    console.log("✓ yazma");
    const read = await getObject(key);
    if (!read.equals(body)) throw new Error("Okunan içerik yazılanla aynı değil");
    console.log("✓ okuma");
    await deleteObject(key);
    console.log("✓ silme");
    console.log("Depolama çalışıyor.");
  } catch (error) {
    console.error("✗", error instanceof Error ? error.message : error);
    console.error("S3_ENDPOINT, S3_BUCKET, S3_REGION ve anahtarları kontrol et.");
    process.exit(1);
  }
}

void main();
