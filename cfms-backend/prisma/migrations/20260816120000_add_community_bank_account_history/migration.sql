-- Tracks every previous community payment account so old payments can be
-- cross-checked against the account that was actually current when they
-- were made, not just whatever the community's bank details are today.
CREATE TABLE "community_bank_account_history" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_bank_account_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_bank_account_history_communityId_idx" ON "community_bank_account_history"("communityId");
CREATE INDEX "community_bank_account_history_accountNumber_idx" ON "community_bank_account_history"("accountNumber");

ALTER TABLE "community_bank_account_history" ADD CONSTRAINT "community_bank_account_history_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
