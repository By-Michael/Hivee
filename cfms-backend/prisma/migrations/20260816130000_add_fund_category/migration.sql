-- Adds a dedicated "category" column instead of overloading "description"
-- for it (see schema.prisma comment / adapters.js SCHEMA GAP note).
ALTER TABLE "funds" ADD COLUMN "category" TEXT;

-- Backfill: every existing fund had its category value stored in
-- "description" (the only thing that column was ever used for in
-- practice — see adapters.js fundToUI). Move it over, then clear
-- "description" so it's free for genuine notes going forward.
UPDATE "funds" SET "category" = "description" WHERE "description" IS NOT NULL;
UPDATE "funds" SET "description" = NULL;
