-- Payments are meant to be append-only financial records (see comments on
-- Payment.recordedBy/verifiedBy in schema.prisma) — they should never
-- disappear just because the Project or Fund they were made toward gets
-- deleted later. They previously did (CASCADE), same failure mode
-- Expense.project already avoided with SET NULL. Bring Payment in line.
--
-- IF EXISTS guards below because constraint names can drift depending on
-- how earlier migrations were actually applied in a given environment;
-- this is safe to run either way.
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_projectId_fkey";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_fundId_fkey";

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_fundId_fkey"
  FOREIGN KEY ("fundId") REFERENCES "funds"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
