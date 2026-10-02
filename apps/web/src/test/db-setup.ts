import { vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL tanımlı değil. Veritabanı testlerini `npm run test:db` ile çalıştırın.");
}

// Güvenlik: tablolar her testte boşaltılır; yanlışlıkla dev veritabanına bağlanılmasın.
const dbName = new URL(url).pathname.replace(/^\//, "");
if (!dbName.endsWith("_test")) {
  throw new Error(`Test veritabanı adı "_test" ile bitmeli (bulunan: "${dbName}"). Testler durduruldu.`);
}

process.env.DATABASE_URL = url;
process.env.AUTH_SECRET ??= "test-secret-en-az-32-karakter-uzunlugunda";

// Servisler `ApiError` için api-auth'u içe aktarır; o da oturum/başlık okuyan modülleri çeker.
// Bu testler oturum kullanmaz, bu yüzden bu modüller boş taklitle değiştirilir.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
