-- Makes expenses effectively append-only: corrections are recorded as a
-- new, linked, offsetting Expense row instead of mutating the original.
--
-- Purely additive, same shape as the earlier payment/fund migration:
-- `createdAt` backfills to `spentAt` for existing rows so the delete grace
-- window (measured in the app layer against createdAt) doesn't retroactively
-- treat old expenses as fresh; `reversesId`/`isVoided` default to
-- null/false, so no existing expense is affected until someone explicitly
-- reverses it going forward.

ALTER TABLE "expenses" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "expenses" SET "createdAt" = "spentAt";

ALTER TABLE "expenses" ADD COLUMN "reversesId" TEXT;
ALTER TABLE "expenses" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "expenses_reversesId_key" ON "expenses"("reversesId");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_reversesId_fkey"
  FOREIGN KEY ("reversesId") REFERENCES "expenses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
