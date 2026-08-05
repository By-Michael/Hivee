const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const createExpense = catchAsync(async (req, res) => {
  if (req.body.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: req.body.projectId, communityId: req.communityId },
    });
    if (!project) throw new AppError('Project not found in this community', 404);
  }

  const expense = await prisma.expense.create({
    data: { ...req.body, recordedBy: req.user.id },
  });
  res.status(201).json({ success: true, data: expense });
});

const listExpenses = catchAsync(async (req, res) => {
  const expenses = await prisma.expense.findMany({
    where: {
      OR: [
        { project: { communityId: req.communityId } },
        { recorder: { communityId: req.communityId } },
      ],
    },
    include: {
      project: { select: { id: true, name: true } },
      recorder: { select: { id: true, fullName: true } },
      receipts: true,
    },
    orderBy: { spentAt: 'desc' },
  });
  res.json({ success: true, data: expenses });
});

const getExpense = catchAsync(async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: {
      id: req.params.id,
      OR: [
        { project: { communityId: req.communityId } },
        { recorder: { communityId: req.communityId } },
      ],
    },
    include: { project: true, recorder: { select: { id: true, fullName: true } }, receipts: true },
  });
  if (!expense) throw new AppError('Expense not found', 404);
  res.json({ success: true, data: expense });
});

const updateExpense = catchAsync(async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: {
      id: req.params.id,
      OR: [
        { project: { communityId: req.communityId } },
        { recorder: { communityId: req.communityId } },
      ],
    },
  });
  if (!expense) throw new AppError('Expense not found', 404);

  const updated = await prisma.expense.update({ where: { id: expense.id }, data: req.body });
  res.json({ success: true, data: updated });
});

const deleteExpense = catchAsync(async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: {
      id: req.params.id,
      OR: [
        { project: { communityId: req.communityId } },
        { recorder: { communityId: req.communityId } },
      ],
    },
  });
  if (!expense) throw new AppError('Expense not found', 404);

  await prisma.expense.delete({ where: { id: expense.id } });
  res.json({ success: true, message: 'Expense deleted' });
});

module.exports = { createExpense, listExpenses, getExpense, updateExpense, deleteExpense };
