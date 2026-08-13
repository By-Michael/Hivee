-- Performance fix: payments/expenses used to be scoped to a community only
-- indirectly (via OR fee.communityId / project.communityId / fund.communityId
-- / recorder.communityId), which forces Postgres to join out to another
-- table on every single list/report/aggregate query. That's fine at dozens
-- of rows and slow at thousands+.
--
-- This adds a direct, indexed communityId column to both tables, backfilled
-- from the existing (always-consistent) relations, so those queries become
-- a plain indexed equality filter instead of a join.

-- 1) Add nullable columns first so we can backfill existing rows.
ALTER TABLE "payments" ADD COLUMN "communityId" TEXT;
ALTER TABLE "expenses" ADD COLUMN "communityId" TEXT;

-- 2) Backfill payments: a payment's community is always the same as the
--    resident who made it (residentId -> user -> communityId). This holds
--    for every payment regardless of whether it's for a fee/project/fund,
--    since the app only ever lets a resident pay into their own community's
--    fees/projects/funds.
UPDATE "payments" p
SET "communityId" = u."communityId"
FROM "residents" r
JOIN "users" u ON u."id" = r."userId"
WHERE r."id" = p."residentId";

-- 3) Backfill expenses: an expense's community is always the community of
--    whoever recorded it (recordedBy -> communityId), which is how
--    listExpenses already resolves community for expenses with no project.
UPDATE "expenses" e
SET "communityId" = u."communityId"
FROM "users" u
WHERE u."id" = e."recordedBy";

-- 4) Enforce NOT NULL now that every existing row has a value.
ALTER TABLE "payments" ALTER COLUMN "communityId" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "communityId" SET NOT NULL;

-- 5) Foreign keys + indexes.
ALTER TABLE "payments" ADD CONSTRAINT "payments_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "payments_communityId_idx" ON "payments"("communityId");
CREATE INDEX "expenses_communityId_idx" ON "expenses"("communityId");

-- Composite indexes matching the most common list/report query shape
-- (scope to a community, sort by date) so those don't need a separate
-- sort step after the index scan.
CREATE INDEX "payments_communityId_paidAt_idx" ON "payments"("communityId", "paidAt");
CREATE INDEX "expenses_communityId_spentAt_idx" ON "expenses"("communityId", "spentAt");
