-- AlterTable
ALTER TABLE "communities" ADD COLUMN     "paymentAccountName" TEXT,
ADD COLUMN     "paymentAccountNumber" TEXT,
ADD COLUMN     "paymentBankName" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "reason" TEXT;
