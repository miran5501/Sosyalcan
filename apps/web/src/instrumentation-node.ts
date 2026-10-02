import "@/lib/timezone";
import { checkEnv, formatEnvProblems } from "@/lib/env";

/** Yalnızca Node.js sunucusunda çalışır (instrumentation.ts içinden yüklenir). */
const problems = checkEnv();
if (problems.length > 0) {
  console.error(formatEnvProblems(problems));
  process.exit(1);
}
