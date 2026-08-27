-- Product decision: Hivee only supports CBE and Telebirr as payment
-- providers going forward. Removes DASHEN, ABYSSINIA, CBEBIRR, MPESA,
-- BANK_OTHER from the PaymentProvider enum.
--
-- Postgres can't drop values from an enum in place, so this recreates the
-- type. Before doing that, any existing community_payment_methods rows
-- using a provider being removed are:
--   1. disabled (isActive = false) so residents stop seeing them
--      immediately, and their label is annotated so a committee admin
--      opening Settings understands why it disappeared and that the
--      underlying bank/account details are still visible for reference;
--   2. remapped to CBE only so the column has a value the narrowed enum
--      still allows — this is a storage-layer placeholder, not a claim
--      that the account IS a CBE account. Existing bankName/accountName/
--      accountNumber/fullName/phoneNumber are left untouched, and
--      historical Payment rows keep their paymentMethodId FK either way,
--      so nothing about past payment history changes.
UPDATE "community_payment_methods"
SET "isActive" = false,
    "label" = "label" || ' (provider discontinued — contact committee)'
WHERE "provider" NOT IN ('CBE', 'TELEBIRR');

UPDATE "community_payment_methods"
SET "provider" = 'CBE'
WHERE "provider" NOT IN ('CBE', 'TELEBIRR');

-- Swap in the narrowed enum type.
CREATE TYPE "PaymentProvider_new" AS ENUM ('CBE', 'TELEBIRR');

ALTER TABLE "community_payment_methods"
  ALTER COLUMN "provider" TYPE "PaymentProvider_new"
  USING ("provider"::text::"PaymentProvider_new");

DROP TYPE "PaymentProvider";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";
