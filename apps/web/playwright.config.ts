import { defineConfig } from "@playwright/test";

/**
 * Tarayıcı (uçtan uca) testleri: `npm run test:e2e`.
 * scripts/e2e.mjs ayrı bir veritabanını (sosyalcan_e2e) sıfırlayıp demo verisiyle doldurur, sonra bu
 * yapılandırmayla üretim derlemesini 3200 portunda başlatır ve testleri gerçek tarayıcıda koşturur.
 * Yerelde bilgisayardaki Chrome kullanılır (indirme gerekmez); CI'da Playwright'ın Chromium'u.
 */
// Güvenlik: testler kullanıcı/kayıt oluşturur. Doğrudan `npx playwright test` çalıştırılırsa .env'deki
// geliştirme veritabanına yazabilirdi; yalnızca ayrı e2e veritabanıyla (npm run test:e2e) çalışsın.
if (!/_e2e(\?|$)/.test(new URL(process.env.DATABASE_URL ?? "postgresql://x/yok").pathname)) {
  throw new Error("Tarayıcı testleri yalnızca `npm run test:e2e` ile çalıştırılır (ayrı sosyalcan_e2e veritabanı).");
}

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e",
  // Testler aynı veritabanını kullanır: sırayla koşsun.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
