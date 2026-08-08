const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');
const { verifyBankTransaction } = require('../utils/bankVerification');
const { parseReceiptImage } = require('../utils/ocrReceipt');

// Helper: resolve the resident record that this request is allowed to act as.
async function resolveResidentId(req) {
  if (req.user.role === 'RESIDENT') {
    const resident = await prisma.resident.findUnique({ where: { userId: req.user.id } });
    if (!resident) throw new AppError('Resident profile not found', 404);
    return resident.id;
  }
  // ADMIN recording on behalf of someone
  if (!req.body.residentId) throw new AppError('residentId is required', 422);
  const resident = await prisma.resident.findFirst({
    where: { id: req.body.residentId, user: { communityId: req.communityId } },
  });
  if (!resident) throw new AppError('Resident not found in this community', 404);
  return resident.id;
}

const createPayment = catchAsync(async (req, res) => {
  const residentId = await resolveResidentId(req);

  const fee = await prisma.fee.findFirst({
    where: { id: req.body.feeId, communityId: req.communityId },
  });
  if (!fee) throw new AppError('Fee not found in this community', 404);

  const payment = await prisma.payment.create({
    data: {
      residentId,
      feeId: fee.id,
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod,
      transactionReference: req.body.transactionReference,
      paidAt: req.body.paidAt,
      status: 'PENDING',
    },
  });

  await recordAudit(req, { action: 'CREATE', entityType: 'Payment', entityId: payment.id, description: `Recorded payment of ${payment.amount} for fee ${fee.name}` });
  res.status(201).json({ success: true, data: payment });
});

const listPayments = catchAsync(async (req, res) => {
  let where = { fee: { communityId: req.communityId } };

  if (req.user.role === 'RESIDENT') {
    const resident = await prisma.resident.findUnique({ where: { userId: req.user.id } });
    if (!resident) throw new AppError('Resident profile not found', 404);
    where.residentId = resident.id;
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      fee: { select: { id: true, name: true } },
      resident: { include: { user: { select: { fullName: true, email: true } } } },
    },
    orderBy: { paidAt: 'desc' },
  });

  res.json({ success: true, data: payments });
});

const getPayment = catchAsync(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, fee: { communityId: req.communityId } },
    include: { fee: true, resident: { include: { user: true } } },
  });
  if (!payment) throw new AppError('Payment not found', 404);

  if (req.user.role === 'RESIDENT') {
    const resident = await prisma.resident.findUnique({ where: { userId: req.user.id } });
    if (!resident || payment.residentId !== resident.id) {
      throw new AppError('You do not have permission to view this payment', 403);
    }
  }

  res.json({ success: true, data: payment });
});

// ADMIN verifies or rejects a payment.
const updatePaymentStatus = catchAsync(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, fee: { communityId: req.communityId } },
  });
  if (!payment) throw new AppError('Payment not found', 404);

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: req.body.status, verifiedBy: req.user.id },
  });

  await recordAudit(req, {
    action: req.body.status === 'VERIFIED' ? 'VERIFY' : req.body.status === 'REJECTED' ? 'REJECT' : 'UPDATE',
    entityType: 'Payment',
    entityId: payment.id,
    description: `Marked payment ${payment.id.slice(0, 8)} as ${req.body.status}`,
  });

  res.json({ success: true, data: updated });
});

// Resident self-serve flow: submit a bank txn ID + the name it was sent
// under, and get verified against the bank instantly instead of waiting
// on an admin. Required fields are just feeId + txnId + payerName.
const selfVerifyPayment = catchAsync(async (req, res) => {
  if (req.user.role !== 'RESIDENT') {
    throw new AppError('Only residents can submit self-verified payments', 403);
  }

  const { feeId, txnId, payerName, reason } = req.body;
  if (!feeId) throw new AppError('feeId is required', 422);
  if (!txnId || !txnId.trim()) throw new AppError('Transaction ID is required', 422);
  if (!payerName || !payerName.trim()) throw new AppError('Payer name is required', 422);

  const resident = await prisma.resident.findUnique({ where: { userId: req.user.id } });
  if (!resident) throw new AppError('Resident profile not found', 404);

  const fee = await prisma.fee.findFirst({ where: { id: feeId, communityId: req.communityId } });
  if (!fee) throw new AppError('Fee not found in this community', 404);

  const community = await prisma.community.findUnique({ where: { id: req.communityId } });

  // A transaction ID can only ever pay for one fee — block reuse (typo'd
  // resubmits are fine since they'll get a fresh ID, but the same real
  // transfer can't be used to "pay" twice).
  const alreadyUsed = await prisma.payment.findFirst({
    where: {
      transactionReference: txnId.trim(),
      fee: { communityId: req.communityId },
      status: { not: 'REJECTED' },
    },
  });
  if (alreadyUsed) {
    throw new AppError('This transaction ID has already been used for a payment', 409);
  }

  const result = await verifyBankTransaction({
    txnId: txnId.trim(),
    expectedAmount: Number(fee.amount),
    expectedAccountNumber: community?.paymentAccountNumber,
  });

  if (!result.matched) {
    throw new AppError(result.reason || 'Could not verify this transaction. Double-check the ID and try again.', 422);
  }

  const payment = await prisma.payment.create({
    data: {
      residentId: resident.id,
      feeId: fee.id,
      amount: fee.amount,
      paymentMethod: 'BANK_TRANSFER',
      transactionReference: txnId.trim(),
      payerName: payerName.trim(),
      reason: reason?.trim() || undefined,
      status: 'VERIFIED',
    },
  });

  await recordAudit(req, {
    action: 'VERIFY',
    entityType: 'Payment',
    entityId: payment.id,
    description: `Auto-verified payment of ${payment.amount} for fee "${fee.name}" via bank transaction lookup`,
  });

  res.status(201).json({ success: true, data: payment });
});

// Best-effort autofill: OCR the uploaded screenshot and try to pull out a
// name and transaction ID. Never trusted directly — the resident still
// sees and can correct these fields before submitting.
const parsePaymentScreenshot = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('Screenshot file is required', 422);
  const { txnId, name, rawText } = await parseReceiptImage(req.file.buffer, req.file.mimetype, req.file.originalname);
  res.json({ success: true, data: { txnId, name, rawText } });
});

module.exports = {
  createPayment,
  listPayments,
  getPayment,
  updatePaymentStatus,
  selfVerifyPayment,
  parsePaymentScreenshot,
};
