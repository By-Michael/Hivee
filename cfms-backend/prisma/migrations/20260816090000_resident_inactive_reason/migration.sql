-- Track why/when a resident account was deactivated.
ALTER TABLE "residents" ADD COLUMN "inactiveReason" TEXT;
ALTER TABLE "residents" ADD COLUMN "inactivatedAt" TIMESTAMP(3);
