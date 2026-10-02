/**
 * Tarayıcı testleri: `npm run test:e2e` (derlemeyi yenilemek için: `npm run test:e2e -- --build`).
 *
 * 1) Ayrı bir veritabanı (adı sosyalcan_e2e): migration'lar uygulanır, tablolar boşaltılır, demo verisi yüklenir.
 *    Geliştirme veritabanına ASLA dokunulmaz: adı "_e2e" ile bitmeyen veritabanında betik durur.
 * 2) Derleme yoksa (ya da --build verildiyse) `npm run build`.
 * 3) Playwright, üretim sunucusunu 3200 portunda bu veritabanıyla başlatıp testleri koşturur.
 *    Redis kullanılmaz (sayaçlar bellekte): testler birbirinin istek sınırını etkilemesin.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const envFile = new URL("../.env", import.meta.url);
const fromFile = existsSync(envFile) ? readFileSync(envFile, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1] : undefined;
const base = fromFile ?? process.env.DATABASE_URL;
if (!base) {
  console.error("DATABASE_URL bulunamadı (.env ya da ortam değişkeni).");
  process.exit(1);
}
const url = new URL(base);
url.pathname = "/sosyalcan_e2e";
const e2eUrl = url.toString();
if (!url.pathname.endsWith("_e2e")) {
  console.error("Güvenlik: e2e veritabanının adı _e2e ile bitmeli.");
  process.exit(1);
}

const port = process.env.E2E_PORT ?? "3200";
const env = {
  ...process.env,
  DATABASE_URL: e2eUrl,
  REDIS_URL: "",
  AUTH_TRUST_HOST: "true",
  APP_URL: `http://localhost:${port}`,
  E2E_PORT: port,
  // Testler tarihleri uygulamanın saat dilimine göre kurar; sunucu UTC olsa da (CI) aynı sonuç çıksın.
  TZ: "Europe/Istanbul",
  // E-postayla 2FA testi: SMTP yok, kodlar giden kutusundan okunur.
  EMAIL_2FA_WITHOUT_SMTP: "true",
  // Dosya ekleri geliştirme klasörüne değil ayrı bir klasöre yazılsın.
  STORAGE_DRIVER: "local",
  STORAGE_DIR: new URL("../.e2e-uploads", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
};

function run(cmd, cmdArgs, options = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: true, env, ...options });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`E2E veritabanı: ${url.pathname.slice(1)} (${url.host})`);
// Şema güncel olsun (yalnızca eksik migration'lar uygulanır), sonra tablolar boşaltılıp demo verisi yüklenir.
// Not: "prisma migrate reset" bilinçli olarak kullanılmaz (her şeyi silip yeniden kurar).
run("npx", ["prisma", "migrate", "deploy"]);
run("node", ["scripts/e2e-clean.mjs"]);
run("npm", ["run", "seed"]);

const buildMissing = !existsSync(new URL("../.next/BUILD_ID", import.meta.url));
if (args.includes("--build") || buildMissing) {
  run("npm", ["run", "build"]);
}

run("npx", ["playwright", "test", ...args.filter((a) => a !== "--build")]);
