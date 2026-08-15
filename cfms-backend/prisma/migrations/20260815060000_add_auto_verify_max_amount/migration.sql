-- AlterTable
-- autoVerifyMaxAmount existed in schema.prisma but was never migrated, so
-- writes to it (e.g. PATCH /community/me/current) failed with
-- "Invalid data provided to database query" / P2022 column-not-found.
-- IF NOT EXISTS: this column turned out to already exist in the target
-- database from an earlier manual/partial attempt, which made the
-- unconditional ADD COLUMN fail with 42701 on a real deploy. Idempotent so
-- re-running this migration (e.g. after a resolve, or on a second target
-- database) can't hard-fail on this specific error again.
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "autoVerifyMaxAmount" DECIMAL(12,2);
