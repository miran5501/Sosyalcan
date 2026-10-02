-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "changes" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

