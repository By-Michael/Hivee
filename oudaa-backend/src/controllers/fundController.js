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

// Sums a fund's real cash straight from the database with grouped
// aggregates, instead of fetching every project/expense/payment row into
// Node and summing them in JavaScript. The old approach (still visible in
// git history) fetched the ENTIRE expenses and payments tables a second
// time — nested under funds->projects->expenses/payments — on top of the
// already-separate /payments and /expenses list calls, which is why
// dashboard load got dramatically slower as those tables grew. This does
// the same math as five small grouped-by-fund queries, each backed by an
// existing index (Project.communityId, Expense.projectId, Payment.fundId/
// projectId/status), and combines the results in memory — a handful of
// rows per fund, not every transaction ever recorded.
async function computeFundMoneyForCommunity(communityId, fundIds) {
  const [allocationTotals, projectCounts, expenseTotals, paymentsViaProjects, paymentsDirect, expensesDirect] = await Promise.all([
    // A project's budget can now be split across several funds
    // (ProjectFundAllocation), so "allocated" per fund is the sum of this
    // fund's own slice, not the whole project.budget — see schema.prisma
    // comment on ProjectFundAllocation.
    prisma.$queryRaw`
      SELECT pfa."fundId" as "fundId", COALESCE(SUM(pfa.amount), 0)::float AS total
      FROM project_fund_allocations pfa
      JOIN projects pr ON pr.id = pfa."projectId"
      WHERE pr."communityId" = ${communityId} AND pfa."fundId" = ANY(${fundIds}::text[])
      GROUP BY pfa."fundId"
    `,
    prisma.$queryRaw`
      SELECT pfa."fundId" as "fundId", COUNT(DISTINCT pfa."projectId")::int AS count
      FROM project_fund_allocations pfa
      JOIN projects pr ON pr.id = pfa."projectId"
      WHERE pr."communityId" = ${communityId} AND pfa."fundId" = ANY(${fundIds}::text[])
      GROUP BY pfa."fundId"
    `,
    // Expenses/payments are recorded per-project, not per-fund, so once a
    // project spans multiple funds we attribute spend/collection to each
    // fund proportionally to that fund's share of the project's budget
    // (pfa.amount / pr.budget). A single-fund project just gets a ratio of
    // 1, so this is a no-op for the common case and existing data
    // (backfilled 1:1 by the migration).
    prisma.$queryRaw`
      SELECT pfa."fundId" as "fundId",
             COALESCE(SUM(e.amount * (pfa.amount / pr.budget)), 0)::float AS total
      FROM expenses e
      JOIN projects pr ON pr.id = e."projectId"
      JOIN project_fund_allocations pfa ON pfa."projectId" = pr.id
      WHERE pr."communityId" = ${communityId} AND pfa."fundId" = ANY(${fundIds}::text[])
        AND pr.budget > 0
      GROUP BY pfa."fundId"
    `,
    prisma.$queryRaw`
      SELECT pfa."fundId" as "fundId",
             COALESCE(SUM(pay.amount * (pfa.amount / pr.budget)), 0)::float AS total
      FROM payments pay
      JOIN projects pr ON pr.id = pay."projectId"
      JOIN project_fund_allocations pfa ON pfa."projectId" = pr.id
      WHERE pay.status = 'VERIFIED' AND pr."communityId" = ${communityId} AND pfa."fundId" = ANY(${fundIds}::text[])
        AND pr.budget > 0
      GROUP BY pfa."fundId"
    `,
    prisma.payment.groupBy({
      by: ['fundId'],
      where: { communityId, status: 'VERIFIED', fundId: { in: fundIds } },
      _sum: { amount: true },
    }),
    // Expenses recorded straight against a fund (no project attached) —
    // mirrors paymentsDirect above. See Expense.fundId comment in
    // schema.prisma.
    prisma.expense.groupBy({
      by: ['fundId'],
      where: { communityId, fundId: { in: fundIds } },
      _sum: { amount: true },
    }),
  ]);

  const allocatedByFund = new Map(allocationTotals.map((r) => [r.fundId, Number(r.total || 0)]));
  const projectCountByFund = new Map(projectCounts.map((r) => [r.fundId, r.count]));
  const spentViaProjectsByFund = new Map(expenseTotals.map((r) => [r.fundId, Number(r.total || 0)]));
  const spentDirectByFund = new Map(expensesDirect.map((r) => [r.fundId, Number(r._sum.amount || 0)]));
  const collectedViaProjectsByFund = new Map(paymentsViaProjects.map((r) => [r.fundId, Number(r.total || 0)]));
  const collectedDirectByFund = new Map(paymentsDirect.map((r) => [r.fundId, Number(r._sum.amount || 0)]));

  const byFund = new Map();
  for (const fundId of fundIds) {
    const allocated = allocatedByFund.get(fundId) || 0;
    const spent = (spentViaProjectsByFund.get(fundId) || 0) + (spentDirectByFund.get(fundId) || 0);
    const verifiedCollected = (collectedViaProjectsByFund.get(fundId) || 0) + (collectedDirectByFund.get(fundId) || 0);
    byFund.set(fundId, {
      totalAllocated: allocated,
      totalSpent: spent,
      remaining: allocated - spent,
      verifiedCollected,
      actualBalance: verifiedCollected - spent,
      projectCount: projectCountByFund.get(fundId) || 0,
    });
  }
  return byFund;
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
    select: { id: true, name: true },
  });
  if (!fund) throw new AppError('Fund not found', 404);

  const byFund = await computeFundMoneyForCommunity(req.communityId, [fund.id]);

  res.json({
    success: true,
    data: { fundId: fund.id, fundName: fund.name, ...byFund.get(fund.id) },
  });
});

// Bulk version of getFundSummary: one round trip of small grouped
// aggregates covering every fund in the community, instead of one round
// trip per fund AND instead of fetching every project/expense/payment row.
const listFundSummaries = catchAsync(async (req, res) => {
  const funds = await prisma.fund.findMany({
    where: { communityId: req.communityId },
    select: { id: true, name: true },
  });
  if (funds.length === 0) return res.json({ success: true, data: [] });

  const byFund = await computeFundMoneyForCommunity(req.communityId, funds.map((f) => f.id));

  const data = funds.map((fund) => ({
    fundId: fund.id,
    fundName: fund.name,
    ...byFund.get(fund.id),
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

// Deletion rule: a fund can be deleted once it's fully wound down —
//   1. actualBalance is exactly zero (everything verified-collected has
//      been spent; no leftover cash that deletion would just erase).
//   2. No pending/pending_review payment is sitting against it (direct or
//      via one of its projects) — i.e. nothing that, if verified after
//      deletion, would have landed money into a fund that no longer
//      exists. This covers "no payment made to it after/while it was
//      zero" — a payment can only ever push the balance again once it's
//      actually verified, so an unresolved one is exactly the risk.
// This replaces the old "any expense ever logged blocks deletion
// forever" rule — that was overly permanent. Money already spent is fine
// to have happened; what matters is nothing is left AND nothing is still
// in flight. Projects under the fund cascade-delete, but their expenses
// and payments are NOT lost — see schema.prisma: Payment.project/fund and
// Expense.project all use SetNull, not Cascade, so the financial trail
// (what was actually paid and spent) survives as orphaned records.
const deleteFund = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { projects: { select: { id: true } } },
  });
  if (!fund) throw new AppError('Fund not found', 404);

  const byFund = await computeFundMoneyForCommunity(req.communityId, [fund.id]);
  const { actualBalance } = byFund.get(fund.id) || { actualBalance: 0 };
  if (actualBalance !== 0) {
    throw new AppError(
      `This fund still holds a balance of ${actualBalance.toFixed(2)} — it needs to be fully spent (or otherwise brought to zero) before it can be deleted.`,
      403
    );
  }

  const projectIds = fund.projects.map((p) => p.id);
  const pendingCount = await prisma.payment.count({
    where: {
      communityId: req.communityId,
      status: { in: ['PENDING', 'PENDING_REVIEW'] },
      OR: [{ fundId: fund.id }, ...(projectIds.length ? [{ projectId: { in: projectIds } }] : [])],
    },
  });
  if (pendingCount > 0) {
    throw new AppError(
      `This fund has ${pendingCount} pending payment${pendingCount === 1 ? '' : 's'} awaiting verification. Verify or reject ${pendingCount === 1 ? 'it' : 'them'} first — approving one after the fund is deleted would have nowhere to land.`,
      403
    );
  }

  await prisma.fund.delete({ where: { id: fund.id } });
  await recordAudit(req, {
    action: 'DELETE',
    entityType: 'Fund',
    entityId: fund.id,
    description: `Deleted fund "${fund.name}" at zero balance with no pending payments (${projectIds.length} linked project(s) removed; their expenses/payments were kept and detached, not deleted)`,
  });
  res.json({ success: true, message: 'Fund deleted' });
});

module.exports = { createFund, listFunds, getFund, getFundSummary, listFundSummaries, updateFund, deleteFund, computeFundMoneyForCommunity };
