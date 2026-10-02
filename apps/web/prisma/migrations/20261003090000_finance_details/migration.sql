-- Finans kaydı ayrıntıları: ödeme yöntemi (admin'in listesi), kime ödendi / kimden alındı, tarih dizini
-- (yıllar boyunca biriken kayıtlarda ay/yıl raporları hızlı kalsın).
-- Yeni enum değeri bu migration'da veriyle kullanılmadığı için aynı dosyada eklenebilir.

ALTER TYPE "OptionKind" ADD VALUE 'PAYMENT_METHOD';

ALTER TABLE "transactions" ADD COLUMN "counterparty" TEXT,
ADD COLUMN "paymentMethodId" TEXT;

CREATE INDEX "transactions_occurredAt_idx" ON "transactions"("occurredAt");

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "option_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
