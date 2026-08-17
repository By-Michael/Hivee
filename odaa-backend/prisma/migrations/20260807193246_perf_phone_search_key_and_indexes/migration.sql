-- AlterTable
ALTER TABLE "residents" ADD COLUMN     "phoneSearchKey" VARCHAR(9);

-- CreateIndex
CREATE INDEX "expenses_recordedBy_idx" ON "expenses"("recordedBy");

-- CreateIndex
CREATE INDEX "expenses_spentAt_idx" ON "expenses"("spentAt");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "residents_phoneSearchKey_idx" ON "residents"("phoneSearchKey");
