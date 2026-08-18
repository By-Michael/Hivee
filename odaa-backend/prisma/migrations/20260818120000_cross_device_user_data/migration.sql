-- Moves data that was previously stored only in the browser (localStorage)
-- into the database, so it's shared across every device a user logs in
-- from instead of being tied to one browser.
--
--   * users.avatar_url / avatar_storage_key : profile picture, previously
--     a base64 data URL cached under `odaa_avatar_${userId}`.
--   * users.preferences : theme, sidebar-collapsed, default export format,
--     per-category notification mutes — previously several separate
--     localStorage keys (`odaa_theme`, `odaa_sidebar_collapsed`,
--     `odaa_default_export_format`, `odaa_notif_prefs_${userId}`).
--   * funds.goal : fundraising target, previously the client-only
--     `fundGoal` meta overlay.
--   * receipts.verified : admin verification flag, previously the
--     client-only `receiptVerified` meta overlay.

ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "users" ADD COLUMN "avatarStorageKey" TEXT;
ALTER TABLE "users" ADD COLUMN "preferences" JSONB DEFAULT '{}';

ALTER TABLE "funds" ADD COLUMN "goal" DECIMAL(12,2);

ALTER TABLE "receipts" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
