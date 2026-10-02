/**
 * Vercel derlemesi (Vercel, package.json'da `vercel-build` varsa `build` yerine onu çalıştırır):
 * 1) bekleyen migration'ları uygular,
 * 2) SEED_ADMIN_EMAIL tanımlıysa ve hiç kullanıcı yoksa ilk Admin'i oluşturur,
 * 3) uygulamayı derler (`npm run build`: ortam kontrolü + prisma generate + next build).
 *
 * DIRECT_URL verilirse migration ve ilk Admin için o kullanılır: havuzlu (pooler) bağlantı
 * migration kilidini desteklemez; uygulama çalışırken DATABASE_URL (havuzlu) kullanılır.
 */
import { spawnSync } from "node:child_process";

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!directUrl) {
  console.error("DATABASE_URL tanımlı değil.");
  process.exit(1);
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: directUrl });
if (process.env.SEED_ADMIN_EMAIL) {
  // Kullanıcı varsa seed hiçbir şey yapmaz; her yayında güvenle çalışır.
  run("npx", ["tsx", "prisma/seed.ts"], { DATABASE_URL: directUrl, SEED_MODE: "production" });
}
run("npm", ["run", "build"]);
