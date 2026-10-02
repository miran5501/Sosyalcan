-- Bildirimi listeden kaldırma (çarpı): satır kalır, tekrar engelleme bozulmasın.
ALTER TABLE "notifications" ADD COLUMN "dismissedAt" TIMESTAMP(3);
