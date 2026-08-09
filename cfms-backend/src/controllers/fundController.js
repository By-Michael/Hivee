const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');

const createFund = catchAsync(async (req, res) => {
  const fund = await prisma.fund.create({ data: { ...req.body, communityId: req.communityId } });
  await recordAudit(req, { action: 'CREATE', entityType: 'Fund', entityId: fund.id, description: `Created fund "${fund.name}"` });
  res.status(201).json({ success: true, data: fund });
});

const listFunds = catchAsync(async (req, res) => {
  const funds = await prisma.fund.findMany({
    where: { communityId: req.communityId },
    include: { _count: { select: { projects: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: funds });
});

const getFund = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { projects: true },
  });
  if (!fund) throw new AppError('Fund not found', 404);
  res.json({ success: true, data: fund });
});

// Sums a fund's real cash: VERIFIED payments made directly to the fund,
// plus VERIFIED payments made to any project under it, minus everything
// spent via those projects' expenses. Fee payments never appear here on
// purpose — fees fund operating costs, not fund-linked projects, so they
// don't affect any fund's balance (see Payment.fundId schema comment).
function computeFundMoney(fund) {
  let allocated = 0;
  let spent = 0;
  let collectedViaProjects = 0;
  for (const project of fund.projects) {
    allocated += Number(project.budget);
    for (const expense of project.expenses) spent += Number(expense.amount);
    for (const payment of project.payments) {
      if (payment.status === 'VERIFIED') collectedViaProjects += Number(payment.amount);
    }
  }
  const collectedDirect = fund.payments
    .filter((p) => p.status === 'VERIFIED')
    .reduce((s, p) => s + Number(p.amount), 0);
  const verifiedCollected = collectedViaProjects + collectedDirect;

  return {
    // Budget-vs-actual view (unchanged): what was planned to spend, and
    // what has actually gone out the door via expenses.
    totalAllocated: allocated,
    totalSpent: spent,
    remaining: allocated - spent,
    // Real-money view (new): what has actually come in from residents,
    // verified, from any source that counts toward this fund, minus what's
    // actually been spent. This — not `remaining` — answers "how much
    // money do we actually have in this fund right now?"
    verifiedCollected,
    actualBalance: verifiedCollected - spent,
    projectCount: fund.projects.length,
  };
}

const FUND_SUMMARY_INCLUDE = {
  projects: { include: { expenses: true, payments: { select: { status: true, amount: true } } } },
  payments: { select: { status: true, amount: true } },
};

// Fund financial summary: budget math (allocated/spent/remaining) shown
// alongside the real cash position (verifiedCollected/actualBalance).
const getFundSummary = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: FUND_SUMMARY_INCLUDE,
  });
  if (!fund) throw new AppError('Fund not found', 404);

  res.json({
    success: true,
    data: { fundId: fund.id, fundName: fund.name, ...computeFundMoney(fund) },
  });
});

// Bulk version of getFundSummary: one query for every fund in the
// community instead of one round trip per fund (avoids N+1 when the
// frontend renders a fund list).
const listFundSummaries = catchAsync(async (req, res) => {
  const funds = await prisma.fund.findMany({
    where: { communityId: req.communityId },
    include: FUND_SUMMARY_INCLUDE,
  });

  const data = funds.map((fund) => ({
    fundId: fund.id,
    fundName: fund.name,
    ...computeFundMoney(fund),
  }));

  res.json({ success: true, data });
});

const updateFund = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!fund) throw new AppError('Fund not found', 404);

  const updated = await prisma.fund.update({ where: { id: fund.id }, data: req.body });
  await recordAudit(req, { action: 'UPDATE', entityType: 'Fund', entityId: fund.id, description: `Updated fund "${updated.name}"` });
  res.json({ success: true, data: updated });
});

// Same reasoning as project deletion: once money has actually been spent
// under this fund (via any of its projects), deleting the fund would take
// the financial trail down with it, so it's blocked. Name/description stay
// freely editable via updateFund above since they don't affect history.
const deleteFund = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { projects: { include: { _count: { select: { expenses: true } } } } },
  });
  if (!fund) throw new AppError('Fund not found', 404);

  const totalExpenses = fund.projects.reduce((sum, p) => sum + p._count.expenses, 0);
  if (totalExpenses > 0) {
    throw new AppError('This fund has projects with expenses logged against them and can no longer be deleted.', 403);
  }

  await prisma.fund.delete({ where: { id: fund.id } });
  await recordAudit(req, { action: 'DELETE', entityType: 'Fund', entityId: fund.id, description: `Deleted fund "${fund.name}" (no expenses had been logged under it)` });
  res.json({ success: true, message: 'Fund deleted' });
});

module.exports = { createFund, listFunds, getFund, getFundSummary, listFundSummaries, updateFund, deleteFund };
