const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const createFee = catchAsync(async (req, res) => {
  const fee = await prisma.fee.create({
    data: { ...req.body, communityId: req.communityId },
  });
  res.status(201).json({ success: true, data: fee });
});

const listFees = catchAsync(async (req, res) => {
  const fees = await prisma.fee.findMany({
    where: { communityId: req.communityId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: fees });
});

const getFee = catchAsync(async (req, res) => {
  const fee = await prisma.fee.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!fee) throw new AppError('Fee not found', 404);
  res.json({ success: true, data: fee });
});

const updateFee = catchAsync(async (req, res) => {
  const fee = await prisma.fee.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!fee) throw new AppError('Fee not found', 404);

  const updated = await prisma.fee.update({ where: { id: fee.id }, data: req.body });
  res.json({ success: true, data: updated });
});

const deleteFee = catchAsync(async (req, res) => {
  const fee = await prisma.fee.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!fee) throw new AppError('Fee not found', 404);

  await prisma.fee.delete({ where: { id: fee.id } });
  res.json({ success: true, message: 'Fee deleted' });
});

module.exports = { createFee, listFees, getFee, updateFee, deleteFee };
