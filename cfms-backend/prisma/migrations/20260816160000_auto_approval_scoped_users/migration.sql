-- Adds per-proposer scoping to committee auto-approvals. Empty array keeps
-- the existing "applies to anyone" behavior for every row already in the
-- table, so this is backward compatible with no data migration needed.
ALTER TABLE "committee_auto_approvals"
  ADD COLUMN "scopedToUserIds" TEXT[] NOT NULL DEFAULT '{}';
