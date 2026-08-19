-- CreateEnum
CREATE TYPE "TransferRequestStatus" AS ENUM ('PENDING_COMMITTEE', 'PENDING_RECIPIENT', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "committee_transfer_requests" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toResidentId" TEXT NOT NULL,
    "status" "TransferRequestStatus" NOT NULL DEFAULT 'PENDING_COMMITTEE',
    "recipientDecision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "committee_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_transfer_approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "committeeUserId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "committee_transfer_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "committee_transfer_requests_communityId_idx" ON "committee_transfer_requests"("communityId");

-- CreateIndex
CREATE INDEX "committee_transfer_requests_toResidentId_idx" ON "committee_transfer_requests"("toResidentId");

-- CreateIndex
CREATE UNIQUE INDEX "committee_transfer_approvals_requestId_committeeUserId_key" ON "committee_transfer_approvals"("requestId", "committeeUserId");

-- AddForeignKey
ALTER TABLE "committee_transfer_requests" ADD CONSTRAINT "committee_transfer_requests_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_transfer_requests" ADD CONSTRAINT "committee_transfer_requests_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_transfer_requests" ADD CONSTRAINT "committee_transfer_requests_toResidentId_fkey" FOREIGN KEY ("toResidentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_transfer_approvals" ADD CONSTRAINT "committee_transfer_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "committee_transfer_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_transfer_approvals" ADD CONSTRAINT "committee_transfer_approvals_committeeUserId_fkey" FOREIGN KEY ("committeeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
