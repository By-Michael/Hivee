const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');
const { computeFundMoneyForCommunity } = require('./fundController');

const createExpense = catchAsync(async (req, res) => {
  let project = null;
  if (req.body.projectId) {
    project = await prisma.project.findFirst({
      where: { id: req.body.projectId, communityId: req.communityId },
      include: { fundAllocations: true, _count: { select: { expenses: true } } },
    });
    if (!project) throw new AppError('Project not found in this community', 404);

    const amount = Number(req.body.amount);

    // Check 1: the project's own remaining budget. Regardless of how much
    // real cash sits in the linked fund(s), a project shouldn't be able to
    // spend past what was actually budgeted for it — that's the whole
    // point of tracking a per-project budget instead of just spending
    // straight out of the fund.
    const spentSoFarAgg = await prisma.expense.aggregate({
      where: { projectId: project.id },
      _sum: { amount: true },
    });
    const spentSoFar = Number(spentSoFarAgg._sum.amount || 0); // reversals are negative, so this already nets out
    const remainingBudget = Number(project.budget) - spentSoFar;
    if (amount > remainingBudget) {
      throw new AppError(
        `This expense (${amount.toFixed(2)}) would exceed "${project.name}"'s remaining project budget of ${remainingBudget.toFixed(2)}.`,
        422,
      );
    }

    // Check 2: the real, verified cash actually sitting in the fund(s)
    // this project draws from — a committee can't spend money the
    // community hasn't actually collected yet, independent of what the
    // budget on paper says. A project can now span several funds (see
    // ProjectFundAllocation), so we sum each linked fund's real balance
    // rather than checking a single fundId like before.
    const fundIds = project.fundAllocations.length > 0
      ? project.fundAllocations.map((a) => a.fundId)
      : [project.fundId];
    const byFund = await computeFundMoneyForCommunity(req.communityId, fundIds);
    const availableAcrossFunds = fundIds.reduce((sum, id) => sum + (byFund.get(id)?.actualBalance || 0), 0);

    if (amount > availableAcrossFunds) {
      const fundWord = fundIds.length > 1 ? 'funds linked to this project have' : "this project's fund has";
      throw new AppError(
        availableAcrossFunds > 0
          ? `The ${fundWord} only ${availableAcrossFunds.toFixed(2)} available — this expense would put it into deficit.`
          : `The ${fundWord} a balance of ${availableAcrossFunds < 0 ? availableAcrossFunds.toFixed(2) : '0.00'} — there's no money left to spend from it.`,
        422,
      );
    }
  }

  const expense = await prisma.expense.create({
    data: { ...req.body, communityId: req.communityId, recordedBy: req.user.id },
  });
  await recordAudit(req, { action: 'CREATE', entityType: 'Expense', entityId: expense.id, description: `Recorded expense "${expense.description || expense.category}" (${expense.amount})` });
  res.status(201).json({ success: true, data: expense });
});

// Expense.communityId is a denormalized, indexed copy of the recorder's
// community (see schema.prisma comment) — a plain equality filter instead
// of joining out through project/recorder on every query.
// Paginated for the same reason payments/residents are — see
// paymentController.js / residentController.js comments.
const listExpenses = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 300));

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where: { communityId: req.communityId },
      include: {
        project: { select: { id: true, name: true } },
        recorder: { select: { id: true, fullName: true } },
        receipts: true,
        reversal: true,
        reverses: { select: { id: true, description: true, amount: true, category: true } },
      },
      orderBy: { spentAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where: { communityId: req.communityId } }),
  ]);

  res.json({
    success: true,
    data: expenses,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

const getExpense = catchAsync(async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: {
      project: true,
      recorder: { select: { id: true, fullName: true } },
      receipts: true,
      reversal: true,
      reverses: true,
    },
  });
  if (!expense) throw new AppError('Expense not found', 404);
  res.json({ success: true, data: expense });
});

// Expenses are the record of where money went, so they're effectively
// append-only: there is no destructive update. A correction is made by
// reversing the original (see reverseExpense below) and, if a corrected
// amount is needed, recording a fresh Expense for it. Both stay visible in
// the trail forever instead of one overwriting the other.
//
// Narrow exception: an expense can still be hard-deleted, but ONLY within a
// short grace window right after creation, before anyone could plausibly
// have relied on it — and only by the person who recorded it, only if it
// has no receipts attached yet, and only if it hasn't been reversed (or is
// itself a reversal). This is intentionally much tighter than the
// equivalent Payment exception, because an expense is the actual proof of
// where community funds went.
const DELETE_GRACE_WINDOW_MS = 15 * 60 * 1000;

const EXPENSE_COMMUNITY_FILTER = (communityId) => ({ communityId });

// Reverses an expense by creating a linked, negative-amount Expense that
// offsets it — never mutates the original row. The reversal nets out
// automatically in fund/project budget math (computeFundMoney sums
// expense.amount directly), so no separate exclusion logic is needed
// anywhere else in the system.
const reverseExpense = catchAsync(async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: { id: req.params.id, ...EXPENSE_COMMUNITY_FILTER(req.communityId) },
  });
  if (!expense) throw new AppError('Expense not found', 404);
  if (expense.isVoided) throw new AppError('This expense has already been reversed', 409);
  if (expense.reversesId) throw new AppError('A reversal entry cannot itself be reversed directly — record a new expense if the correction needs undoing', 409);

  const reason = (req.body && req.body.reason) || null;

  const [reversal] = await prisma.$transaction([
    prisma.expense.create({
      data: {
        communityId: req.communityId,
        projectId: expense.projectId,
        recordedBy: req.user.id,
        category: expense.category,
        description: reason ? `Reversal of ${expense.id.slice(0, 8)}: ${reason}` : `Reversal of expense ${expense.id.slice(0, 8)}`,
        vendor: expense.vendor,
        amount: Number(expense.amount) * -1,
        reversesId: expense.id,
      },
    }),
    prisma.expense.update({ where: { id: expense.id }, data: { isVoided: true } }),
  ]);

  await recordAudit(req, {
    action: 'UPDATE',
    entityType: 'Expense',
    entityId: expense.id,
    description: `Reversed expense "${expense.description || expense.category}" (${expense.amount}) via new entry ${reversal.id.slice(0, 8)}${reason ? `: ${reason}` : ''}`,
    metadata: {
      originalExpense: { ...expense, amount: Number(expense.amount) },
      reversalId: reversal.id,
      reason,
    },
  });

  res.status(201).json({ success: true, data: reversal });
});

const deleteExpense = catchAsync(async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: { id: req.params.id, ...EXPENSE_COMMUNITY_FILTER(req.communityId) },
    include: { receipts: true },
  });
  if (!expense) throw new AppError('Expense not found', 404);

  if (expense.recordedBy !== req.user.id) {
    throw new AppError('Only the person who recorded this expense can delete it, and only shortly after recording it. Use reverse instead.', 403);
  }
  const ageMs = Date.now() - new Date(expense.createdAt).getTime();
  if (ageMs > DELETE_GRACE_WINDOW_MS) {
    throw new AppError('This expense can no longer be deleted (past the 15-minute grace window). Use reverse to correct it instead.', 403);
  }
  if (expense.receipts.length > 0) {
    throw new AppError('This expense has receipts attached and can no longer be deleted. Use reverse instead.', 403);
  }
  if (expense.isVoided || expense.reversesId) {
    throw new AppError('Reversed expenses and reversal entries cannot be deleted — they are part of the permanent trail.', 403);
  }

  await prisma.expense.delete({ where: { id: expense.id } });
  await recordAudit(req, {
    action: 'DELETE',
    entityType: 'Expense',
    entityId: expense.id,
    description: `Deleted expense "${expense.description || expense.category}" (${expense.amount}) within grace window, no receipts attached`,
    metadata: { ...expense, amount: Number(expense.amount) },
  });
  res.json({ success: true, message: 'Expense deleted' });
});

module.exports = { createExpense, listExpenses, getExpense, reverseExpense, deleteExpense };
