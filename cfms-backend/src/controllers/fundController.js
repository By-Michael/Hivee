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

// Fund financial summary: allocated (project budgets) vs. actually spent (expenses).
const getFundSummary = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { projects: { include: { expenses: true } } },
  });
  if (!fund) throw new AppError('Fund not found', 404);

  let allocated = 0;
  let spent = 0;
  for (const project of fund.projects) {
    allocated += Number(project.budget);
    for (const expense of project.expenses) spent += Number(expense.amount);
  }

  res.json({
    success: true,
    data: {
      fundId: fund.id,
      fundName: fund.name,
      totalAllocated: allocated,
      totalSpent: spent,
      remaining: allocated - spent,
      projectCount: fund.projects.length,
    },
  });
});

// Bulk version of getFundSummary: computes allocated/spent for every fund
// in the community with two aggregate-friendly queries instead of one
// round trip per fund (avoids N+1 when the frontend renders a fund list).
const listFundSummaries = catchAsync(async (req, res) => {
  const funds = await prisma.fund.findMany({
    where: { communityId: req.communityId },
    include: { projects: { include: { expenses: true } } },
  });

  const data = funds.map((fund) => {
    let allocated = 0;
    let spent = 0;
    for (const project of fund.projects) {
      allocated += Number(project.budget);
      for (const expense of project.expenses) spent += Number(expense.amount);
    }
    return {
      fundId: fund.id,
      fundName: fund.name,
      totalAllocated: allocated,
      totalSpent: spent,
      remaining: allocated - spent,
      projectCount: fund.projects.length,
    };
  });

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

const deleteFund = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!fund) throw new AppError('Fund not found', 404);

  await prisma.fund.delete({ where: { id: fund.id } });
  await recordAudit(req, { action: 'DELETE', entityType: 'Fund', entityId: fund.id, description: `Deleted fund "${fund.name}"` });
  res.json({ success: true, message: 'Fund deleted' });
});

module.exports = { createFund, listFunds, getFund, getFundSummary, listFundSummaries, updateFund, deleteFund };
