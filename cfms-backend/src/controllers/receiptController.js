const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const uploadReceipt = catchAsync(async (req, res) => {
  const { expenseId } = req.body;
  if (!expenseId) throw new AppError('expenseId is required', 422);
  if (!req.file) throw new AppError('Receipt file is required', 422);

  const expense = await prisma.expense.findFirst({
    where: {
      id: expenseId,
      OR: [
        { project: { communityId: req.communityId } },
        { recorder: { communityId: req.communityId } },
      ],
    },
  });
  if (!expense) throw new AppError('Expense not found in this community', 404);
  if (expense.isVoided) throw new AppError('This expense has been reversed and no longer accepts new receipts', 409);

  const receipt = await prisma.receipt.create({
    data: {
      expenseId,
      fileUrl: `/uploads/receipts/${req.file.filename}`,
    },
  });

  res.status(201).json({ success: true, data: receipt });
});

const listReceiptsForExpense = catchAsync(async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: {
      id: req.params.expenseId,
      OR: [
        { project: { communityId: req.communityId } },
        { recorder: { communityId: req.communityId } },
      ],
    },
  });
  if (!expense) throw new AppError('Expense not found', 404);

  const receipts = await prisma.receipt.findMany({
    where: { expenseId: expense.id },
    orderBy: { uploadedAt: 'desc' },
  });
  res.json({ success: true, data: receipts });
});

const deleteReceipt = catchAsync(async (req, res) => {
  const receipt = await prisma.receipt.findFirst({
    where: {
      id: req.params.id,
      expense: {
        OR: [
          { project: { communityId: req.communityId } },
          { recorder: { communityId: req.communityId } },
        ],
      },
    },
  });
  if (!receipt) throw new AppError('Receipt not found', 404);

  await prisma.receipt.delete({ where: { id: receipt.id } });
  res.json({ success: true, message: 'Receipt deleted' });
});

module.exports = { uploadReceipt, listReceiptsForExpense, deleteReceipt };
