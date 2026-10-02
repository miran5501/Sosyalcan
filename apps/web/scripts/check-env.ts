/**
 * Derlemeden önce ortam değişkeni kontrolü (`npm run build` bunu otomatik çalıştırır).
 * .env dosyası varsa onu da okur (Next.js'in yaptığı gibi); ortamdaki değerler önceliklidir.
 */
import { existsSync } from "node:fs";
import { checkEnv, formatEnvProblems } from "../src/lib/env";

for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file); // var olan değişkenlerin üzerine yazmaz
  }
}

const problems = checkEnv();
if (problems.length > 0) {
  console.error(formatEnvProblems(problems));
  process.exit(1);
}
console.log("Ortam değişkenleri geçerli.");
