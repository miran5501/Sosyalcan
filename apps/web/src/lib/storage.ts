import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { AwsClient } from "aws4fetch";

/**
 * Dosya depolama (dosya ekleri). İki sürücü:
 * - local: sunucunun diski (`STORAGE_DIR`, varsayılan `apps/web/uploads`). Yerel geliştirme ve Docker
 *   (kalıcı volume ile) için. Vercel gibi sunucusuz ortamlarda disk kalıcı değildir; orada kullanılamaz.
 * - s3: S3 uyumlu nesne depolama (AWS S3, Cloudflare R2, MinIO, Backblaze B2...). `S3_*` ayarlarıyla açılır.
 *
 * Vercel'de `STORAGE_DRIVER=s3` verilmemişse dosya yükleme kapalıdır (uygulama bozulmaz, düğme pasif olur).
 * Anahtarları (`storageKey`) her zaman sunucu üretir; kullanıcının verdiği dosya adı yola girmez.
 */
export type StorageDriver = "local" | "s3";
export type StorageStatus = { enabled: true; driver: StorageDriver } | { enabled: false; reason: string };

export function storageStatus(): StorageStatus {
  const driver = process.env.STORAGE_DRIVER as StorageDriver | undefined;
  if (driver === "s3") {
    const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((n) => !process.env[n]);
    return missing.length ? { enabled: false, reason: `Dosya depolama ayarı eksik: ${missing.join(", ")}` } : { enabled: true, driver: "s3" };
  }
  if (!driver && process.env.VERCEL) {
    return { enabled: false, reason: "Dosya yükleme için bulut depolama (S3/R2) ayarı yapılmamış." };
  }
  return { enabled: true, driver: "local" };
}

// --- local ---

function localRoot() {
  // Yol çalışma anında belirlenir; derleme bu klasörü (ve projeyi) pakete dahil etmeye çalışmasın.
  return resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR || join(/* turbopackIgnore: true */ process.cwd(), "uploads"));
}

function localPath(key: string) {
  const root = localRoot();
  const path = resolve(root, key);
  // Anahtar sunucuda üretilse de, yol kökün dışına çıkamaz.
  if (!path.startsWith(root + sep)) throw new Error("Geçersiz depolama anahtarı");
  return path;
}

// --- s3 ---

let s3Client: AwsClient | null = null;
function s3() {
  s3Client ??= new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    region: process.env.S3_REGION || "auto",
    service: "s3",
  });
  return s3Client;
}

function s3Url(key: string) {
  const endpoint = process.env.S3_ENDPOINT!.replace(/\/+$/, "");
  // Yol biçimi (endpoint/bucket/key): AWS, R2 ve MinIO'nun hepsinde çalışır.
  return `${endpoint}/${process.env.S3_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function s3Request(method: "PUT" | "GET" | "DELETE", key: string, init: { body?: Buffer; contentType?: string } = {}) {
  const response = await s3().fetch(s3Url(key), {
    method,
    body: init.body ? new Uint8Array(init.body) : undefined,
    headers: init.contentType ? { "content-type": init.contentType } : undefined,
  });
  if (!response.ok && !(method === "DELETE" && response.status === 404)) {
    throw new Error(`Depolama hatası (${method} ${response.status})`);
  }
  return response;
}

// --- ortak arayüz ---

function requireEnabled(): StorageDriver {
  const status = storageStatus();
  if (!status.enabled) throw new Error(status.reason);
  return status.driver;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (requireEnabled() === "s3") {
    await s3Request("PUT", key, { body, contentType });
    return;
  }
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, { flag: "wx" }); // var olan dosyanın üzerine asla yazma
}

export async function getObject(key: string): Promise<Buffer> {
  if (requireEnabled() === "s3") {
    return Buffer.from(await (await s3Request("GET", key)).arrayBuffer());
  }
  return readFile(localPath(key));
}

export async function deleteObject(key: string): Promise<void> {
  if (requireEnabled() === "s3") {
    await s3Request("DELETE", key);
    return;
  }
  await rm(localPath(key), { force: true });
}
