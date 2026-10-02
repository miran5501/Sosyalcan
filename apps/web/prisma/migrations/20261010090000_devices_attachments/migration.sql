-- Yeni cihazdan giriş uyarısı: kişinin tanınan cihazları.
CREATE TABLE "known_devices" (
    "id" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIp" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "known_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "known_devices_userId_deviceHash_key" ON "known_devices"("userId", "deviceHash");
ALTER TABLE "known_devices" ADD CONSTRAINT "known_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dosya ekleri: çekim (teslim dosyası) ya da finans kaydı (fatura); tam olarak biri dolu.
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shootId" TEXT,
    "transactionId" TEXT,
    "uploadedById" TEXT,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attachments_one_owner" CHECK (("shootId" IS NULL) <> ("transactionId" IS NULL))
);
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");
CREATE INDEX "attachments_shootId_idx" ON "attachments"("shootId");
CREATE INDEX "attachments_transactionId_idx" ON "attachments"("transactionId");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_shootId_fkey" FOREIGN KEY ("shootId") REFERENCES "shoots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
