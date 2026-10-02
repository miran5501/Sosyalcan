import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Veritabanı testleri: `npm run test:db` (ayrı sosyalcan_test veritabanı kullanır).
export default defineConfig({
  test: {
    environment: "node",
    // Testler de uygulamanın saat diliminde koşsun (CI sunucusu UTC olsa da).
    env: { TZ: "Europe/Istanbul" },
    include: ["src/**/*.db.test.ts"],
    setupFiles: ["src/test/db-setup.ts"],
    // Testler aynı veritabanını paylaşır; dosyalar sırayla çalışmalı.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
