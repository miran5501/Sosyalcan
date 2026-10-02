/**
 * Yedekten geri yükleme ve geri yükleme tatbikatı.
 *
 *   npm run db:restore-test [-- <yedek.dump>]
 *     Yedeği (verilmezse en yenisini) AYRI bir veritabanına (`<ad>_restore_test`) açar, tabloları
 *     sayar ve kaynak veritabanıyla karşılaştırır. Canlı veriye dokunmaz. Aylık tatbikat bu komuttur.
 *
 *   node scripts/restore-db.mjs --into <veritabanı> --force <yedek.dump>
 *     Gerçek geri yükleme: hedef veritabanını SİLİP yedekten yeniden kurar. Yalnızca açıkça
 *     --force verilirse ve hedef adı yazılırsa çalışır. Önce mutlaka güncel bir yedek alın.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { databaseUrl, dbName, withDatabase } from "./db-url.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--into" && args[i - 1] !== "--dir");

const source = databaseUrl();
const dir = option("--dir") ?? fileURLToPath(new URL("../../../_yedek/otomatik", import.meta.url));

let file = positional[0];
if (!file) {
  const latest = readdirSync(dir)
    .filter((f) => f.startsWith(`${dbName(source)}-`) && f.endsWith(".dump"))
    .sort()
    .pop();
  if (!latest) {
    console.error(`Yedek bulunamadı: ${dir} (önce npm run db:backup)`);
    process.exit(1);
  }
  file = join(dir, latest);
}

const into = option("--into");
const real = Boolean(into);
if (real && !flag("--force")) {
  console.error("Gerçek geri yükleme hedef veritabanını siler. Emin isen --force ekle.");
  process.exit(1);
}
const targetName = into ?? `${dbName(source)}_restore_test`;
if (!real && targetName === dbName(source)) {
  console.error("Tatbikat kaynak veritabanının üstüne yazamaz.");
  process.exit(1);
}
const target = withDatabase(source, targetName);
const admin = withDatabase(source, "postgres");

function run(cmd, cmdArgs, { capture = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"] });
  if (r.error || r.status !== 0) {
    console.error(`${cmd} başarısız${r.error ? `: ${r.error.message}` : ""}${capture ? `\n${r.stderr}` : ""}`);
    process.exit(1);
  }
  return r.stdout;
}

console.log(`Yedek: ${file}\nHedef: ${targetName}${real ? " (GERÇEK GERİ YÜKLEME)" : " (tatbikat)"}`);
run("psql", [admin.toString(), "-v", "ON_ERROR_STOP=1", "-q", "-c", `DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`]);
run("psql", [admin.toString(), "-v", "ON_ERROR_STOP=1", "-q", "-c", `CREATE DATABASE "${targetName}"`]);
run("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", `--dbname=${target.toString()}`, file]);

// Doğrulama: her tablonun satır sayısı (tatbikatta kaynakla karşılaştırılır).
const countSql = `SELECT string_agg(t.relname || '=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public."' || t.relname || '"', false, true, '')))[1]::text, ',' ORDER BY t.relname)
FROM pg_stat_user_tables t WHERE t.schemaname = 'public'`;
const counts = (url) => run("psql", [url.toString(), "-At", "-c", countSql], { capture: true }).trim();

const restored = counts(target);
console.log(`\nGeri yüklenen tablolar:\n  ${restored.split(",").join("\n  ")}`);
const migrations = run("psql", [target.toString(), "-At", "-c", 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'], { capture: true }).trim();
console.log(`Uygulanmış migration sayısı: ${migrations}`);

if (!real) {
  const live = counts(source);
  const differences = restored
    .split(",")
    .filter((pair) => !live.split(",").includes(pair));
  // Yedekten sonra canlıda değişen satırlar olabilir; fark varsa bilgi verilir, tatbikat yine geçerlidir.
  console.log(differences.length ? `\nNot: yedekten sonra değişen tablolar: ${differences.join(", ")}` : "\nSatır sayıları canlı veritabanıyla birebir aynı.");
  run("psql", [admin.toString(), "-q", "-c", `DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`]);
  console.log(`\nGERİ YÜKLEME TATBİKATI BAŞARILI (${new Date().toLocaleString("tr-TR")}) — tatbikat veritabanı silindi.`);
} else {
  console.log(`\nGeri yükleme tamamlandı: ${targetName}`);
}
