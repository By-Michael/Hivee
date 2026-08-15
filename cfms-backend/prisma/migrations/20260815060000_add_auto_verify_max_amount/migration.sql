-- AlterTable
-- autoVerifyMaxAmount existed in schema.prisma but was never migrated, so
-- writes to it (e.g. PATCH /community/me/current) failed with
-- "Invalid data provided to database query" / P2022 column-not-found.
ALTER TABLE "communities" ADD COLUMN     "autoVerifyMaxAmount" DECIMAL(12,2);
