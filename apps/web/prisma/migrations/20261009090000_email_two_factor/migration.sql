-- 2FA yöntemi: doğrulama uygulaması (APP) ya da e-postaya gönderilen kod (EMAIL).
CREATE TYPE "TwoFactorMethod" AS ENUM ('APP', 'EMAIL');

ALTER TABLE "users" RENAME COLUMN "totpEnabledAt" TO "twoFactorEnabledAt";
ALTER TABLE "users"
ADD COLUMN "twoFactorMethod" "TwoFactorMethod",
ADD COLUMN "emailOtpHash" TEXT,
ADD COLUMN "emailOtpExpiresAt" TIMESTAMP(3);

-- Mevcut 2FA'lı hesaplar doğrulama uygulamasını kullanıyordu.
UPDATE "users" SET "twoFactorMethod" = 'APP' WHERE "twoFactorEnabledAt" IS NOT NULL;
