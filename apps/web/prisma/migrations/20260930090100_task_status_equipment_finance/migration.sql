-- Görev durumu sabit enum olmaktan çıkıp admin'in yönettiği seçenek listesine taşınır (Kanban sütunları).
-- Görevlere ve çekimlere yeni çoklu ilişkiler: görev paylaşım yerleri, çekim ekipmanları.
-- Finans kayıtlarında kullanılmış kategoriler başlangıç finans kategorileri olarak listeye eklenir.
-- Sabit kimlikler src/lib/options.ts içindeki DEFAULT_OPTIONS ile aynıdır.

-- Eski görev durumlarının karşılığı olan başlangıç seçenekleri
INSERT INTO "option_items" ("id", "kind", "label", "color", "isDone", "sortOrder", "updatedAt") VALUES
    ('opt_task_waiting',  'TASK_STATUS', 'Bekliyor',   'neutral', false, 0, CURRENT_TIMESTAMP),
    ('opt_task_editing',  'TASK_STATUS', 'Kurguda',    'amber',   false, 1, CURRENT_TIMESTAMP),
    ('opt_task_revision', 'TASK_STATUS', 'Revizede',   'blue',    false, 2, CURRENT_TIMESTAMP),
    ('opt_task_done',     'TASK_STATUS', 'Tamamlandı', 'green',   true,  3, CURRENT_TIMESTAMP);

ALTER TABLE "tasks" ADD COLUMN "statusId" TEXT;

UPDATE "tasks" SET "statusId" = CASE "status"
    WHEN 'WAITING' THEN 'opt_task_waiting'
    WHEN 'EDITING' THEN 'opt_task_editing'
    WHEN 'REVISION' THEN 'opt_task_revision'
    ELSE 'opt_task_done' END;

ALTER TABLE "tasks" ALTER COLUMN "statusId" SET NOT NULL;
ALTER TABLE "tasks" DROP COLUMN "status";
DROP TYPE "TaskStatus";

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "option_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Finans kayıtlarında kullanılmış kategoriler (büyük/küçük harf farkı tek sayılır, ilk yazım korunur).
-- Kayıtların kendisi değişmez: finans kaydı kategori adını metin olarak saklamaya devam eder.
INSERT INTO "option_items" ("id", "kind", "label", "sortOrder", "updatedAt")
SELECT 'opt_fin_' || md5(key), 'FINANCE_CATEGORY', label, (row_number() OVER (ORDER BY label)) - 1, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (lower(trim("category"))) lower(trim("category")) AS key, trim("category") AS label
    FROM "transactions"
    WHERE "category" IS NOT NULL AND trim("category") <> ''
    ORDER BY lower(trim("category")), "createdAt"
) used;

-- CreateTable
CREATE TABLE "_TaskPublishTargets" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskPublishTargets_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ShootEquipment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ShootEquipment_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TaskPublishTargets_B_index" ON "_TaskPublishTargets"("B");

-- CreateIndex
CREATE INDEX "_ShootEquipment_B_index" ON "_ShootEquipment"("B");

-- AddForeignKey
ALTER TABLE "_TaskPublishTargets" ADD CONSTRAINT "_TaskPublishTargets_A_fkey" FOREIGN KEY ("A") REFERENCES "option_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskPublishTargets" ADD CONSTRAINT "_TaskPublishTargets_B_fkey" FOREIGN KEY ("B") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShootEquipment" ADD CONSTRAINT "_ShootEquipment_A_fkey" FOREIGN KEY ("A") REFERENCES "option_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShootEquipment" ADD CONSTRAINT "_ShootEquipment_B_fkey" FOREIGN KEY ("B") REFERENCES "shoots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
