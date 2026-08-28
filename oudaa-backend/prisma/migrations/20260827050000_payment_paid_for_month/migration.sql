-- Tracks which calendar month(s) a fee payment counts toward, so the
-- committee can catch a resident up on unpaid months / record a
-- prepayment for a future month, and residents can see which month a
-- given fee payment was for.
ALTER TABLE "payments" ADD COLUMN "paidForMonth" TEXT;
