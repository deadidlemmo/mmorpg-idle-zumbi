ALTER TABLE "audit_logs"
ADD COLUMN "deduplicationKey" TEXT;

CREATE UNIQUE INDEX "audit_logs_deduplicationKey_key"
ON "audit_logs"("deduplicationKey");
