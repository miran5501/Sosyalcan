# SosyalCan Komuta Merkezi

Sosyal medya / içerik ajansları için iç operasyon paneli. Müşteriler, görevler, çekimler, takvim, finans ve ödeme planları tek yerde; ekip web'den ve mobil uygulamadan aynı veriyle çalışır.

## Özellikler

- Müşteri yönetimi (etiketler, notlar, değişiklik geçmişi, Excel/CSV'den aktarma)
- Kanban görev panosu, yorumlar, bağlantılar
- Çekim planlama: ekipman, teslim durumu, kontrol listesi, dosya ekleri
- Takvim (ay / hafta / gün, sürükle-bırak)
- Gelir-gider takibi, KDV, ödeme planları, gelir dağıtımı, raporlar
- Bildirimler (uygulama içi + e-posta)
- Rol bazlı yetki: Admin, Operasyon, Finans, Viewer
- İki adımlı doğrulama, şifre sıfırlama, denetim kaydı
- Mobil uygulama (Expo)

## Teknolojiler

Next.js 16, TypeScript, PostgreSQL, Prisma, Auth.js, Tailwind CSS, Redis, React Native (Expo), Vitest, Playwright

## Kurulum

### Docker ile

Docker Desktop açıkken:

```sh
# Windows
powershell -ExecutionPolicy Bypass -File kurulum.ps1

# Linux / macOS
sh kurulum.sh
```

Betik `.env` dosyasını oluşturur, uygulamayı başlatır ve ilk Admin giriş bilgilerini yazar. Uygulama: http://localhost:3000

Elle kurmak için `.env.example` dosyasını `.env` olarak kopyalayıp düzenle, sonra:

```sh
docker compose --profile app up -d --build
```

### Geliştirme ortamı

Gereksinimler: Node.js 22, PostgreSQL

```sh
cd apps/web
npm install
cp .env.example .env    # DATABASE_URL ve AUTH_SECRET
npx prisma migrate deploy
npm run seed            # demo veri
npm run dev
```

Redis isteğe bağlıdır: `docker compose up -d`

Demo hesaplar: `admin@sosyalcan.local` / `admin1234` (ayrıca `operasyon@`, `finans@`, `viewer@` — şifreleri `operasyon1234` vb.)

Mobil uygulama:

```sh
cd apps/mobile
npm install
npx expo start
```

### Vercel

Root Directory: `apps/web`. Veritabanı için Neon (Frankfurt bölgesi) önerilir. Ortam değişkenleri:

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | Neon havuzlu (pooled) bağlantı adresi, sonuna `&pgbouncer=true` |
| `DIRECT_URL` | Neon doğrudan bağlantı adresi (migration için) |
| `AUTH_SECRET` | En az 32 karakter rastgele metin |
| `CRON_SECRET` | Rastgele metin (zamanlanmış görevler) |
| `APP_URL` | Uygulamanın adresi, ör. `https://sosyalcan.vercel.app` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | İlk Admin hesabı (yalnızca veritabanı boşken kullanılır) |

Her yayında migration'lar otomatik uygulanır. İsteğe bağlı: `REDIS_URL` (Upstash), `SMTP_URL` ve `EMAIL_FROM` (e-posta), `STORAGE_DRIVER=s3` ve `S3_*` (dosya ekleri; Vercel'de disk kalıcı olmadığından gerekir). Tüm değişkenler: `apps/web/.env.example`.

## Testler

```sh
cd apps/web
npm test            # birim testleri
npm run test:db     # veritabanı testleri
npm run test:e2e    # tarayıcı testleri (Playwright)
```

## Proje yapısı

```
apps/web      Next.js uygulaması ve API
apps/mobile   Expo mobil uygulaması
```
