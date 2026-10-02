import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Hızlı testler (veritabanı gerektirmez): `npm test`. Veritabanı testleri: `npm run test:db`.
export default defineConfig({
  test: {
    environment: "node",
    // Testler de uygulamanın saat diliminde koşsun (CI sunucusu UTC olsa da).
    env: { TZ: "Europe/Istanbul" },
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.db.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
