-- Çekim türü ve teslim durumu sabit enum olmaktan çıkıp admin'in yönettiği seçenek listesine (option_items) taşınır.
-- Mevcut değerler aynı adlarla seçenek olarak eklenir ve eski çekimler bunlara bağlanır; veri kaybı olmaz.
-- Sabit kimlikler src/lib/options.ts içindeki DEFAULT_OPTIONS ile aynıdır.

-- CreateEnum
CREATE TYPE "OptionKind" AS ENUM ('SHOOT_TYPE', 'DELIVERY_STATUS', 'PLATFORM', 'POST_FORMAT');

-- CreateTable
CREATE TABLE "option_items" (
    "id" TEXT NOT NULL,
    "kind" "OptionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "option_items_pkey" PRIMARY KEY ("id")
);

-- Eski enum değerlerinin karşılığı olan başlangıç seçenekleri
INSERT INTO "option_items" ("id", "kind", "label", "color", "sortOrder", "updatedAt") VALUES
    ('opt_type_video',       'SHOOT_TYPE',      'Video',         NULL,      0, CURRENT_TIMESTAMP),
    ('opt_type_drone',       'SHOOT_TYPE',      'Drone',         NULL,      1, CURRENT_TIMESTAMP),
    ('opt_type_other',       'SHOOT_TYPE',      'Diğer',         NULL,      2, CURRENT_TIMESTAMP),
    ('opt_status_planned',   'DELIVERY_STATUS', 'Planlandı',     'neutral', 0, CURRENT_TIMESTAMP),
    ('opt_status_shot',      'DELIVERY_STATUS', 'Çekildi',       'blue',    1, CURRENT_TIMESTAMP),
    ('opt_status_editing',   'DELIVERY_STATUS', 'Kurguda',       'amber',   2, CURRENT_TIMESTAMP),
    ('opt_status_delivered', 'DELIVERY_STATUS', 'Teslim Edildi', 'green',   3, CURRENT_TIMESTAMP);

-- Yeni sütunlar önce boş eklenir, eski değerlerden doldurulur, sonra zorunlu yapılır
ALTER TABLE "shoots" ADD COLUMN "typeId" TEXT, ADD COLUMN "deliveryStatusId" TEXT;

UPDATE "shoots" SET "typeId" = CASE "type"
    WHEN 'VIDEO' THEN 'opt_type_video'
    WHEN 'DRONE' THEN 'opt_type_drone'
    ELSE 'opt_type_other' END;

UPDATE "shoots" SET "deliveryStatusId" = CASE "deliveryStatus"
    WHEN 'PLANNED' THEN 'opt_status_planned'
    WHEN 'SHOT' THEN 'opt_status_shot'
    WHEN 'EDITING' THEN 'opt_status_editing'
    ELSE 'opt_status_delivered' END;

ALTER TABLE "shoots" ALTER COLUMN "typeId" SET NOT NULL, ALTER COLUMN "deliveryStatusId" SET NOT NULL;

-- AlterTable
ALTER TABLE "shoots" DROP COLUMN "deliveryStatus", DROP COLUMN "type";

-- DropEnum
DROP TYPE "DeliveryStatus";

-- DropEnum
DROP TYPE "ShootType";

-- CreateTable
CREATE TABLE "_ShootPublishTargets" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ShootPublishTargets_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "option_items_kind_sortOrder_idx" ON "option_items"("kind", "sortOrder");

-- CreateIndex
CREATE INDEX "_ShootPublishTargets_B_index" ON "_ShootPublishTargets"("B");

-- AddForeignKey
ALTER TABLE "option_items" ADD CONSTRAINT "option_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "option_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoots" ADD CONSTRAINT "shoots_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "option_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoots" ADD CONSTRAINT "shoots_deliveryStatusId_fkey" FOREIGN KEY ("deliveryStatusId") REFERENCES "option_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShootPublishTargets" ADD CONSTRAINT "_ShootPublishTargets_A_fkey" FOREIGN KEY ("A") REFERENCES "option_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShootPublishTargets" ADD CONSTRAINT "_ShootPublishTargets_B_fkey" FOREIGN KEY ("B") REFERENCES "shoots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
