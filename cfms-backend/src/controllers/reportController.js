const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');

function parseDateRange(query) {
  const from = query.from ? new Date(query.from) : new Date(0);
  const to = query.to ? new Date(query.to) : new Date();
  return { gte: from, lte: to };
}

// Payments collected in a date range, grouped by fee.
const collectionsReport = catchAsync(async (req, res) => {
  const range = parseDateRange(req.query);

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { fee: { communityId: req.communityId } },
        { project: { communityId: req.communityId } },
        { fund: { communityId: req.communityId } },
      ],
      status: 'VERIFIED',
      paidAt: range,
    },
    include: {
      fee: { select: { name: true } },
      project: { select: { name: true } },
      fund: { select: { name: true } },
      resident: { include: { user: true } },
    },
    orderBy: { paidAt: 'desc' },
  });

  const totalsByFee = {};
  const totalsByProject = {};
  const totalsByFund = {}; // direct-to-fund payments only, not project payments
  let grandTotal = 0;
  for (const p of payments) {
    if (p.feeId) {
      const key = p.fee.name;
      totalsByFee[key] = (totalsByFee[key] || 0) + Number(p.amount);
    } else if (p.projectId) {
      const key = p.project.name;
      totalsByProject[key] = (totalsByProject[key] || 0) + Number(p.amount);
    } else {
      const key = p.fund.name;
      totalsByFund[key] = (totalsByFund[key] || 0) + Number(p.amount);
    }
    grandTotal += Number(p.amount);
  }

  res.json({
    success: true,
    data: { range, grandTotal, totalsByFee, totalsByProject, totalsByFund, payments },
  });
});

// Expenses in a date range, grouped by category.
const expenseReport = catchAsync(async (req, res) => {
  const range = parseDateRange(req.query);

  const expenses = await prisma.expense.findMany({
    where: {
      spentAt: range,
      OR: [
        { project: { communityId: req.communityId } },
        { recorder: { communityId: req.communityId } },
      ],
    },
    include: { project: { select: { name: true } }, recorder: { select: { fullName: true } } },
    orderBy: { spentAt: 'desc' },
  });

  const totalsByCategory = {};
  let grandTotal = 0;
  for (const e of expenses) {
    totalsByCategory[e.category] = (totalsByCategory[e.category] || 0) + Number(e.amount);
    grandTotal += Number(e.amount);
  }

  res.json({
    success: true,
    data: { range, grandTotal, totalsByCategory, expenses },
  });
});

// Community-wide financial summary: income vs expenses vs project budgets.
const financialSummaryReport = catchAsync(async (req, res) => {
  const range = parseDateRange(req.query);
  const communityId = req.communityId;

  const [income, expenses, projects] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        OR: [{ fee: { communityId } }, { project: { communityId } }, { fund: { communityId } }],
        status: 'VERIFIED',
        paidAt: range,
      },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: {
        spentAt: range,
        OR: [{ project: { communityId } }, { recorder: { communityId } }],
      },
      _sum: { amount: true },
    }),
    prisma.project.findMany({
      where: { communityId },
      select: { id: true, name: true, budget: true, status: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      range,
      totalIncome: income._sum.amount || 0,
      totalExpenses: expenses._sum.amount || 0,
      netBalance: Number(income._sum.amount || 0) - Number(expenses._sum.amount || 0),
      projects,
    },
  });
});

module.exports = { collectionsReport, expenseReport, financialSummaryReport };
