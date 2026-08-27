-- Lets a committee register more than one way to receive money (their CBE
-- account, a Telebirr number, a second bank, etc) instead of the single
-- fixed paymentBankName/paymentAccountName/paymentAccountNumber on
-- communities. That trio is left in place for backward compatibility —
-- see paymentController.js's fallback for communities with no rows here
-- yet.

CREATE TYPE "PaymentProvider" AS ENUM ('CBE', 'TELEBIRR', 'DASHEN', 'ABYSSINIA', 'CBEBIRR', 'MPESA', 'BANK_OTHER');

CREATE TABLE "community_payment_methods" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "fullName" TEXT,
    "phoneNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_payment_methods_communityId_idx" ON "community_payment_methods"("communityId");

ALTER TABLE "community_payment_methods" ADD CONSTRAINT "community_payment_methods_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment gets an optional link to whichever configured method it was
-- self-verified through (null for manually-recorded payments and for
-- self-verified payments made before this table existed).
ALTER TABLE "payments" ADD COLUMN "paymentMethodId" TEXT;

ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "community_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
