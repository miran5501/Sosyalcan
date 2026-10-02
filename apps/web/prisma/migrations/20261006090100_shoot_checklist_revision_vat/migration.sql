-- Çekim teslim kontrolü ve finans KDV alanları:
--  * çekimde revizyon sayısı ve teslim kontrol listesi (maddeler admin'in DELIVERY_CHECKLIST listesinden kopyalanır)
--  * finans kaydında KDV oranı/tutarı ve fatura numarası; ödeme planında KDV oranı
-- Sabit kimlikler src/lib/options.ts içindeki DEFAULT_OPTIONS ile aynıdır.

-- Başlangıç kontrol listesi şablonu
INSERT INTO "option_items" ("id", "kind", "label", "sortOrder", "updatedAt") VALUES
    ('opt_check_backup',   'DELIVERY_CHECKLIST', 'Ham görüntüler yedeklendi', 0, CURRENT_TIMESTAMP),
    ('opt_check_edit',     'DELIVERY_CHECKLIST', 'Kurgu tamamlandı',          1, CURRENT_TIMESTAMP),
    ('opt_check_approval', 'DELIVERY_CHECKLIST', 'Müşteri onayı alındı',      2, CURRENT_TIMESTAMP),
    ('opt_check_link',     'DELIVERY_CHECKLIST', 'Teslim linki paylaşıldı',   3, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "payment_plans" ADD COLUMN     "vatRate" INTEGER;

-- AlterTable
ALTER TABLE "shoots" ADD COLUMN     "revisionCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "invoiceNo" TEXT,
ADD COLUMN     "vatAmount" INTEGER,
ADD COLUMN     "vatRate" INTEGER;

-- CreateTable
CREATE TABLE "shoot_checklist_items" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shootId" TEXT NOT NULL,
    "doneById" TEXT,

    CONSTRAINT "shoot_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shoot_checklist_items_shootId_sortOrder_idx" ON "shoot_checklist_items"("shootId", "sortOrder");

-- AddForeignKey
ALTER TABLE "shoot_checklist_items" ADD CONSTRAINT "shoot_checklist_items_shootId_fkey" FOREIGN KEY ("shootId") REFERENCES "shoots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoot_checklist_items" ADD CONSTRAINT "shoot_checklist_items_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Var olan çekimlere şablon maddeleri. "Teslim Edildi" durumundaki çekimlerin maddeleri tamamlanmış sayılır.
INSERT INTO "shoot_checklist_items" ("id", "shootId", "label", "sortOrder", "done", "doneAt")
SELECT 'chk_' || md5(s."id" || o."id"), s."id", o."label", o."sortOrder",
       s."deliveryStatusId" = 'opt_status_delivered',
       CASE WHEN s."deliveryStatusId" = 'opt_status_delivered' THEN CURRENT_TIMESTAMP END
FROM "shoots" s CROSS JOIN "option_items" o
WHERE o."kind" = 'DELIVERY_CHECKLIST' AND o."archivedAt" IS NULL;
