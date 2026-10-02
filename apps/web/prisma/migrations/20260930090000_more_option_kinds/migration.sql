-- Yeni seçenek listesi türleri: görev durumu, ekipman kategorisi, ekipman, finans kategorisi.
-- PostgreSQL yeni enum değerinin aynı işlem (transaction) içinde kullanılmasına izin vermez;
-- bu yüzden değerler bu migration'da eklenir, verilerin taşınması bir sonraki migration'dadır.

ALTER TYPE "OptionKind" ADD VALUE 'TASK_STATUS';
ALTER TYPE "OptionKind" ADD VALUE 'EQUIPMENT_CATEGORY';
ALTER TYPE "OptionKind" ADD VALUE 'EQUIPMENT';
ALTER TYPE "OptionKind" ADD VALUE 'FINANCE_CATEGORY';

-- Görev durumları için: bu sütundaki görev "tamamlandı" sayılır (ana sayfa bugünkü görevlerde göstermez).
ALTER TABLE "option_items" ADD COLUMN "isDone" BOOLEAN NOT NULL DEFAULT false;
