const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

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

  res.json({ success: true, data: updated });
});

module.exports = { createPayment, listPayments, getPayment, updatePaymentStatus };
