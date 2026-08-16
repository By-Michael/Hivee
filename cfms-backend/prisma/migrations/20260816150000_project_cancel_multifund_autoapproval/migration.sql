-- Project cancellation reason
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- Multi-fund allocation per project. project.fundId is kept as the
-- "primary" fund for backward compatibility; real per-fund breakdown
-- lives here. See schema.prisma comment on ProjectFundAllocation.
CREATE TABLE IF NOT EXISTS "project_fund_allocations" (
    "id"        TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fundId"    TEXT NOT NULL,
    "amount"    DECIMAL(12,2) NOT NULL,
    CONSTRAINT "project_fund_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_fund_allocations_projectId_fundId_key"
    ON "project_fund_allocations"("projectId", "fundId");
CREATE INDEX IF NOT EXISTS "project_fund_allocations_fundId_idx"
    ON "project_fund_allocations"("fundId");

DO $$ BEGIN
    ALTER TABLE "project_fund_allocations" ADD CONSTRAINT "project_fund_allocations_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "project_fund_allocations" ADD CONSTRAINT "project_fund_allocations_fundId_fkey"
        FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: every existing project gets a single allocation row matching
-- its current fundId/budget, so computeFundMoney's new sum-over-allocations
-- logic doesn't silently see $0 allocated for pre-existing projects.
INSERT INTO "project_fund_allocations" ("id", "projectId", "fundId", "amount")
SELECT gen_random_uuid()::text, "id", "fundId", "budget" FROM "projects"
ON CONFLICT ("projectId", "fundId") DO NOTHING;

-- Committee standing auto-approval settings
CREATE TABLE IF NOT EXISTS "committee_auto_approvals" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "communityId"    TEXT NOT NULL,
    "changeType"     TEXT NOT NULL,
    "enabled"        BOOLEAN NOT NULL DEFAULT false,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "committee_auto_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "committee_auto_approvals_userId_changeType_key"
    ON "committee_auto_approvals"("userId", "changeType");
CREATE INDEX IF NOT EXISTS "committee_auto_approvals_communityId_idx"
    ON "committee_auto_approvals"("communityId");

DO $$ BEGIN
    ALTER TABLE "committee_auto_approvals" ADD CONSTRAINT "committee_auto_approvals_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "committee_auto_approvals" ADD CONSTRAINT "committee_auto_approvals_communityId_fkey"
        FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Marks whether a PendingChangeApproval was filled in by a standing
-- auto-approval setting rather than an explicit click.
ALTER TABLE "pending_change_approvals" ADD COLUMN IF NOT EXISTS "autoApproved" BOOLEAN NOT NULL DEFAULT false;

-- Storage key/filename for deleting the underlying receipt file (Supabase
-- Storage object key, or local filename) — see src/config/storage.js.
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
