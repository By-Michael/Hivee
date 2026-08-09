const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');
const { verifyBankTransaction, PROVIDERS_NEEDING_SUFFIX, PROVIDERS_NEEDING_PHONE } = require('../utils/bankVerification');
const { parseReceiptImage } = require('../utils/ocrReceipt');

// Amount tolerance for the bank-verification cross-check — covers bank-fee
// rounding, not a loophole. Absolute birr amount, not a percentage, so it
// doesn't scale up into a meaningful gap on large payments.
const AMOUNT_TOLERANCE_BIRR = 1;

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

// Order-insensitive, punctuation-insensitive token overlap check — good
// enough to catch "typed a random string" or "wrong person entirely"
// without being so strict that legitimate name-order/spelling variance
// (very common with transliterated Amharic names) constantly false-flags.
// Deliberately conservative: this is a *safeguard*, not the sole judge —
// anything it's unsure about should fall to a human, not auto-pass.
function namesLikelyMatch(registeredName, bankSenderName) {
  const a = normalizeName(registeredName);
  const b = normalizeName(bankSenderName);
  if (a.length === 0 || b.length === 0) return null; // can't judge — treat as unknown, not a pass
  const overlap = a.filter((tok) => b.includes(tok)).length;
  const minLen = Math.min(a.length, b.length);
  return overlap >= Math.max(1, Math.ceil(minLen * 0.5));
}

const PAYMENT_INCLUDE = {
  fee: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  fund: { select: { id: true, name: true } },
  resident: { include: { user: { select: { fullName: true, email: true } } } },
  recorder: { select: { id: true, fullName: true } },
};

// Every community-scoped payment query needs to reach a payment via
// whichever of the three relations it was made through — a fund-direct
// payment has no fee and no project, so it would otherwise silently
// disappear from every list/report/aggregate the same way project payments
// used to before fee-only filters were fixed.
const communityPaymentFilter = (communityId) => ({
  OR: [
    { fee: { communityId } },
    { project: { communityId } },
    { fund: { communityId } },
  ],
});

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

// Resolves + validates whichever of feeId/projectId/fundId was sent, scoped
// to the current community. Returns { feeId, projectId, fundId, label } with
// exactly one set (the validator already enforced XOR shape).
async function resolveTarget(req) {
  if (req.body.feeId) {
    const fee = await prisma.fee.findFirst({ where: { id: req.body.feeId, communityId: req.communityId } });
    if (!fee) throw new AppError('Fee not found in this community', 404);
    return { feeId: fee.id, projectId: null, fundId: null, label: `fee "${fee.name}"` };
  }
  if (req.body.projectId) {
    const project = await prisma.project.findFirst({ where: { id: req.body.projectId, communityId: req.communityId } });
    if (!project) throw new AppError('Project not found in this community', 404);
    return { feeId: null, projectId: project.id, fundId: null, label: `project "${project.name}"` };
  }
  const fund = await prisma.fund.findFirst({ where: { id: req.body.fundId, communityId: req.communityId } });
  if (!fund) throw new AppError('Fund not found in this community', 404);
  return { feeId: null, projectId: null, fundId: fund.id, label: `fund "${fund.name}"` };
}

const createPayment = catchAsync(async (req, res) => {
  const residentId = await resolveResidentId(req);
  const target = await resolveTarget(req);
  const isAdminRecording = req.user.role === 'ADMIN';

  const payment = await prisma.payment.create({
    data: {
      residentId,
      feeId: target.feeId,
      projectId: target.projectId,
      fundId: target.fundId,
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod,
      transactionReference: req.body.transactionReference,
      paidAt: req.body.paidAt,
      // A committee member recording a payment has, by definition, already
      // received the money (cash in hand, receipt in front of them) — so
      // it's marked verified immediately instead of sitting in a PENDING
      // queue waiting for a second admin action against itself.
      status: isAdminRecording ? 'VERIFIED' : 'PENDING',
      verifiedBy: isAdminRecording ? req.user.id : null,
      recordedBy: isAdminRecording ? req.user.id : null,
    },
    include: PAYMENT_INCLUDE,
  });

  await recordAudit(req, { action: 'CREATE', entityType: 'Payment', entityId: payment.id, description: `Recorded payment of ${payment.amount} for ${target.label}` });
  res.status(201).json({ success: true, data: payment });
});

const listPayments = catchAsync(async (req, res) => {
  let where = communityPaymentFilter(req.communityId);

  if (req.user.role === 'RESIDENT') {
    const resident = await prisma.resident.findUnique({ where: { userId: req.user.id } });
    if (!resident) throw new AppError('Resident profile not found', 404);
    where = { AND: [where, { residentId: resident.id }] };
  }

  const payments = await prisma.payment.findMany({
    where,
    include: PAYMENT_INCLUDE,
    orderBy: { paidAt: 'desc' },
  });

  res.json({ success: true, data: payments });
});

const getPayment = catchAsync(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: {
      id: req.params.id,
      ...communityPaymentFilter(req.communityId),
    },
    include: PAYMENT_INCLUDE,
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
    where: { id: req.params.id, ...communityPaymentFilter(req.communityId) },
  });
  if (!payment) throw new AppError('Payment not found', 404);

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: req.body.status, verifiedBy: req.user.id },
    include: PAYMENT_INCLUDE,
  });

  await recordAudit(req, {
    action: req.body.status === 'VERIFIED' ? 'VERIFY' : req.body.status === 'REJECTED' ? 'REJECT' : 'UPDATE',
    entityType: 'Payment',
    entityId: payment.id,
    description: `Marked payment ${payment.id.slice(0, 8)} as ${req.body.status}`,
  });

  res.json({ success: true, data: updated });
});

// ADMIN edits a payment they (or a fellow committee member) typed in
// manually. Deliberately restricted to payments with recordedBy set — a
// resident's own bank-verified payment is never editable here, since the
// verified bank transaction is the source of truth for that record, not
// whatever a committee member might type into this form afterwards.
const updatePayment = catchAsync(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, ...communityPaymentFilter(req.communityId) },
  });
  if (!payment) throw new AppError('Payment not found', 404);
  if (!payment.recordedBy) {
    throw new AppError('Only manually-recorded payments can be edited. This one was self-verified by the resident.', 403);
  }

  const data = {};
  if (req.body.amount !== undefined) data.amount = req.body.amount;
  if (req.body.paymentMethod !== undefined) data.paymentMethod = req.body.paymentMethod;
  if (req.body.transactionReference !== undefined) data.transactionReference = req.body.transactionReference;
  if (req.body.paidAt !== undefined) data.paidAt = req.body.paidAt;
  if (req.body.feeId || req.body.projectId || req.body.fundId) {
    const target = await resolveTarget(req);
    data.feeId = target.feeId;
    data.projectId = target.projectId;
    data.fundId = target.fundId;
  }

  const updated = await prisma.payment.update({ where: { id: payment.id }, data, include: PAYMENT_INCLUDE });

  await recordAudit(req, { action: 'UPDATE', entityType: 'Payment', entityId: payment.id, description: `Edited manually-recorded payment ${payment.id.slice(0, 8)}` });
  res.json({ success: true, data: updated });
});

// ADMIN deletes a payment they (or a fellow committee member) typed in
// manually — same recordedBy restriction as updatePayment, and for the
// same reason. This is an intentional, narrow exception to "payments are
// append-only": a manual entry is corrected the same way any human data-
// entry mistake is, and the full record is preserved in the audit log
// (metadata snapshot) even after the row itself is gone.
const deletePayment = catchAsync(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, ...communityPaymentFilter(req.communityId) },
    include: PAYMENT_INCLUDE,
  });
  if (!payment) throw new AppError('Payment not found', 404);
  if (!payment.recordedBy) {
    throw new AppError('Only manually-recorded payments can be deleted. This one was self-verified by the resident.', 403);
  }

  await prisma.payment.delete({ where: { id: payment.id } });

  await recordAudit(req, {
    action: 'DELETE',
    entityType: 'Payment',
    entityId: payment.id,
    description: `Deleted manually-recorded payment of ${payment.amount} for ${payment.resident?.user?.fullName || 'a resident'}`,
    metadata: {
      amount: payment.amount,
      residentId: payment.residentId,
      feeId: payment.feeId,
      projectId: payment.projectId,
      fundId: payment.fundId,
      paymentMethod: payment.paymentMethod,
      transactionReference: payment.transactionReference,
      paidAt: payment.paidAt,
    },
  });

  res.json({ success: true, message: 'Payment deleted' });
});

// Attach/replace the receipt photo on a manually-recorded payment. Kept as
// a separate call (like expense receipts) so the record can be created
// fast and the (larger) file upload doesn't block that.
const uploadPaymentReceipt = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('Receipt file is required', 422);

  const payment = await prisma.payment.findFirst({
    where: { id: req.params.id, ...communityPaymentFilter(req.communityId) },
  });
  if (!payment) throw new AppError('Payment not found', 404);
  if (!payment.recordedBy) {
    throw new AppError('Receipts can only be attached to manually-recorded payments', 403);
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { receiptUrl: `/uploads/receipts/${req.file.filename}` },
    include: PAYMENT_INCLUDE,
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

  const { feeId, txnId, payerName, reason, provider, suffix, phoneNumber } = req.body;
  if (!feeId) throw new AppError('feeId is required', 422);
  if (!txnId || !txnId.trim()) throw new AppError('Transaction ID is required', 422);
  if (!payerName || !payerName.trim()) throw new AppError('Payer name is required', 422);
  if (provider && PROVIDERS_NEEDING_SUFFIX.has(provider) && !suffix) {
    throw new AppError('This bank requires the account suffix shown on your receipt', 422);
  }
  if (provider && PROVIDERS_NEEDING_PHONE.has(provider) && !phoneNumber) {
    throw new AppError('This provider requires the phone number the payment was made from', 422);
  }

  const resident = await prisma.resident.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { fullName: true } } },
  });
  if (!resident) throw new AppError('Resident profile not found', 404);

  const fee = await prisma.fee.findFirst({ where: { id: feeId, communityId: req.communityId } });
  if (!fee) throw new AppError('Fee not found in this community', 404);

  // A resident can pay more than the fee's usual amount (e.g. topping up
  // a fund) but never less — an underpayment isn't a valid settlement of
  // the fee, it'd just create confusing partial-payment bookkeeping.
  let amount = Number(fee.amount);
  if (req.body.amount !== undefined) {
    if (req.body.amount < Number(fee.amount)) {
      throw new AppError(`Amount can't be less than ${fee.amount} for this fee`, 422);
    }
    amount = req.body.amount;
  }

  const community = await prisma.community.findUnique({ where: { id: req.communityId } });

  // A transaction ID can only ever pay for one fee — block reuse (typo'd
  // resubmits are fine since they'll get a fresh ID, but the same real
  // transfer can't be used to "pay" twice).
  const alreadyUsed = await prisma.payment.findFirst({
    where: {
      transactionReference: txnId.trim(),
      ...communityPaymentFilter(req.communityId),
      status: { not: 'REJECTED' },
    },
  });
  if (alreadyUsed) {
    throw new AppError('This transaction ID has already been used for a payment', 409);
  }

  const result = await verifyBankTransaction({
    txnId: txnId.trim(),
    expectedAmount: amount,
    expectedAccountNumber: community?.paymentAccountNumber,
    provider,
    suffix,
    phoneNumber,
  });

  if (!result.matched) {
    throw new AppError(result.reason || 'Could not verify this transaction. Double-check the ID and try again.', 422);
  }

  // ---- Safeguard layer: a bank "match" alone doesn't auto-VERIFY. ----
  // Anything the checks below can't positively clear drops to
  // PENDING_REVIEW instead of VERIFIED — an admin still needs to look,
  // but the resident isn't blocked from submitting (avoids just pushing
  // people toward typing more plausible-looking fake IDs to get past a
  // hard rejection).
  const flags = [];

  if (result.fieldsIncomplete) {
    flags.push('Bank response did not include enough detail to cross-check automatically.');
  }

  if (result.amount !== null && result.amount !== undefined) {
    const diff = Math.abs(Number(result.amount) - Number(amount));
    if (diff > AMOUNT_TOLERANCE_BIRR) {
      flags.push(`Bank-reported amount (${result.amount}) differs from expected (${amount}) by more than ${AMOUNT_TOLERANCE_BIRR} birr.`);
    }
  }

  if (result.senderName) {
    const nameOk = namesLikelyMatch(resident.user?.fullName, result.senderName);
    if (nameOk === false) {
      flags.push(`Bank sender name ("${result.senderName}") doesn't look like the resident's registered name.`);
    }
    // nameOk === null (couldn't judge) intentionally doesn't add a flag on
    // its own — fieldsIncomplete already covers "couldn't cross-check".
  }

  if (result.receiverAccount && community?.paymentAccountNumber && result.receiverAccount !== community.paymentAccountNumber) {
    flags.push('Bank-reported receiving account does not match the community\'s registered account.');
  }

  const threshold = community?.autoVerifyMaxAmount ? Number(community.autoVerifyMaxAmount) : null;
  if (threshold !== null && amount >= threshold) {
    flags.push(`Payment amount (${amount}) is at/above the auto-verify review threshold (${threshold}).`);
  }

  const status = flags.length > 0 ? 'PENDING_REVIEW' : 'VERIFIED';

  const payment = await prisma.payment.create({
    data: {
      residentId: resident.id,
      feeId: fee.id,
      amount,
      paymentMethod: 'BANK_TRANSFER',
      transactionReference: txnId.trim(),
      payerName: payerName.trim(),
      reason: reason?.trim() || undefined,
      status,
      verificationRaw: result.raw ?? undefined,
      reviewFlags: flags.length > 0 ? flags.join(' ') : undefined,
    },
    include: PAYMENT_INCLUDE,
  });

  await recordAudit(req, {
    action: status === 'VERIFIED' ? 'VERIFY' : 'UPDATE',
    entityType: 'Payment',
    entityId: payment.id,
    description: status === 'VERIFIED'
      ? `Auto-verified payment of ${payment.amount} for fee "${fee.name}" via bank transaction lookup`
      : `Self-verified payment of ${payment.amount} for fee "${fee.name}" flagged for admin review: ${flags.join(' ')}`,
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
  updatePayment,
  deletePayment,
  uploadPaymentReceipt,
  selfVerifyPayment,
  parsePaymentScreenshot,
};
