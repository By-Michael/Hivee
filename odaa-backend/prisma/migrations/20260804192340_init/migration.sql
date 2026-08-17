-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'RESIDENT');

-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MOVED_OUT');

-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SECURITY', 'WATER', 'CLEANING', 'MAINTENANCE', 'IMPROVEMENT', 'ADMIN', 'OTHER');

-- CreateTable
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "contactInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "communityId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RESIDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "residents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "status" "ResidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fees" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "FeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "dueDay" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "feeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "transactionReference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedBy" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "budget" DECIMAL(12,2) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "vendor" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_communityId_idx" ON "users"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "residents_userId_key" ON "residents"("userId");

-- CreateIndex
CREATE INDEX "fees_communityId_idx" ON "fees"("communityId");

-- CreateIndex
CREATE INDEX "payments_residentId_idx" ON "payments"("residentId");

-- CreateIndex
CREATE INDEX "payments_feeId_idx" ON "payments"("feeId");

-- CreateIndex
CREATE INDEX "funds_communityId_idx" ON "funds"("communityId");

-- CreateIndex
CREATE INDEX "projects_communityId_idx" ON "projects"("communityId");

-- CreateIndex
CREATE INDEX "projects_fundId_idx" ON "projects"("fundId");

-- CreateIndex
CREATE INDEX "expenses_projectId_idx" ON "expenses"("projectId");

-- CreateIndex
CREATE INDEX "receipts_expenseId_idx" ON "receipts"("expenseId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
