/**
 * Veritabanı yedeği: `npm run db:backup`
 *
 * pg_dump ile sıkıştırılmış (custom format, -Fc) bir yedek alır, `_yedek/otomatik/` altına
 * tarih-saatli adla yazar ve en yeni 14 yedeği tutar (eskileri siler). Yedek, `npm run db:restore-test`
 * ile ayrı bir veritabanına açılarak doğrulanabilir.
 *
 * Seçenekler: --dir <klasör>  (varsayılan: repo kökü/_yedek/otomatik)   --keep <adet> (varsayılan 14)
 */
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { databaseUrl, dbName } from "./db-url.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const url = databaseUrl();
const dir = option("--dir", fileURLToPath(new URL("../../../_yedek/otomatik", import.meta.url)));
const keep = Number(option("--keep", "14"));
mkdirSync(dir, { recursive: true });

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
// Yerel saatle: sosyalcan_dev-20261001-160042.dump
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const file = join(dir, `${dbName(url)}-${stamp}.dump`);

const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, url.toString()], {
  stdio: ["ignore", "inherit", "inherit"],
});
if (result.error || result.status !== 0) {
  console.error(`Yedek alınamadı${result.error ? `: ${result.error.message} (pg_dump PATH'te mi?)` : ""}`);
  process.exit(1);
}
const size = statSync(file).size;
if (size < 1024) {
  console.error(`Yedek dosyası şüpheli derecede küçük (${size} bayt): ${file}`);
  process.exit(1);
}
console.log(`Yedek alındı: ${file} (${(size / 1024).toFixed(1)} KB)`);

// Eski yedekleri temizle (yalnızca bu veritabanının otomatik yedekleri).
const prefix = `${dbName(url)}-`;
const backups = readdirSync(dir)
  .filter((f) => f.startsWith(prefix) && f.endsWith(".dump"))
  .sort()
  .reverse();
for (const old of backups.slice(keep)) {
  unlinkSync(join(dir, old));
  console.log(`Eski yedek silindi: ${old}`);
}
