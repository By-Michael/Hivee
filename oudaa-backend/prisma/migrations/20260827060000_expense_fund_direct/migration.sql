-- Lets a committee member record an expense straight against a Fund's
-- real cash, with no Project in between (e.g. an unplanned repair paid
-- directly out of a fund). Mirrors Payment.fundId. `reason` is required
-- at the app layer (expenseValidators.js) whenever fundId is set, since
-- there's no project budget line to justify the spend against.
ALTER TABLE "expenses" ADD COLUMN "fundId" TEXT;
ALTER TABLE "expenses" ADD COLUMN "reason" TEXT;

CREATE INDEX "expenses_fundId_idx" ON "expenses"("fundId");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_fundId_fkey"
  FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
