-- Add direct-to-fund payment support.
--
-- Purely additive: one new nullable column + FK + index. Nothing existing
-- is altered, no data is rewritten, and no existing row's feeId/projectId
-- is touched. Safe to run against production data without a maintenance
-- window; the app-layer XOR check (paymentValidators.js) is updated in the
-- same deploy to accept fundId as the third mutually-exclusive option.

ALTER TABLE "payments" ADD COLUMN "fundId" TEXT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_fundId_fkey"
  FOREIGN KEY ("fundId") REFERENCES "funds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "payments_fundId_idx" ON "payments"("fundId");
