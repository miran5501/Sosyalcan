/**
 * Veritabanı gerektiren testleri AYRI bir veritabanında (sosyalcan_test) çalıştırır.
 * Geliştirme veritabanına (sosyalcan_dev) asla dokunmaz: bağlantı adresi .env'deki
 * DATABASE_URL'den türetilir, yalnızca veritabanı adı sosyalcan_test yapılır.
 *
 * Adımlar: (1) migration'ları test veritabanına uygula (yoksa Prisma oluşturur),
 * (2) vitest'i db yapılandırmasıyla çalıştır.
 * Kullanım: npm run test:db
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Yerelde .env'den, CI'da (dosya yok) ortam değişkeninden okunur.
const envFile = new URL("../.env", import.meta.url);
const fromFile = existsSync(envFile)
  ? readFileSync(envFile, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1]
  : undefined;
const baseUrl = fromFile ?? process.env.DATABASE_URL;
if (!baseUrl) {
  console.error("DATABASE_URL bulunamadı (.env ya da ortam değişkeni).");
  process.exit(1);
}

const url = new URL(baseUrl);
url.pathname = "/sosyalcan_test";
const testUrl = url.toString();
console.log(`Test veritabanı: ${url.pathname.slice(1)} (${url.host})`);

function run(args) {
  return spawnSync("npx", args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl },
  });
}

const migrate = run(["prisma", "migrate", "deploy"]);
if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const tests = run(["vitest", "run", "-c", "vitest.db.config.mts", ...process.argv.slice(2)]);
process.exit(tests.status ?? 1);
