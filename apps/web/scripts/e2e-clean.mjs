/**
 * E2E veritabanındaki tabloları boşaltır (şema ve migration geçmişi kalır), testler her seferinde
 * aynı demo verisiyle başlasın. `npm run test:db`'nin her testten önce yaptığının aynısı.
 * Güvenlik: yalnızca adı "_e2e" ile biten veritabanında çalışır; geliştirme veritabanına dokunamaz.
 */
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "");
const name = url.pathname.slice(1);
if (!name.endsWith("_e2e")) {
  console.error(`Güvenlik: yalnızca *_e2e veritabanı boşaltılabilir (verilen: ${name || "yok"}).`);
  process.exit(1);
}

const prisma = new PrismaClient();
const tables = await prisma.$queryRaw`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
if (tables.length > 0) {
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
await prisma.$disconnect();
console.log(`${name}: ${tables.length} tablo boşaltıldı.`);
