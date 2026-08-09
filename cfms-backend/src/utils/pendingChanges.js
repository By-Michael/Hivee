// Registry of sensitive-change types that can be routed through the
// PendingChange approval flow.
//
// Deliberately NOT a generic "reflectively write diff.field = diff.to onto
// entityType/entityId" applier — that would let a PendingChange row target
// an arbitrary Prisma model/field if entityType/changeType were ever
// attacker-influenced, and it bypasses per-model validation. Each
// changeType gets its own small, explicit apply function that calls the
// real update with named fields, same as any other controller would.
//
// To add a new sensitive-change type later: add an entry here with
// {label, buildDiff(currentEntity, proposedFields), apply(tx, entityId, diff)}
// and wire its submit endpoint to createPendingChange().

const AppError = require('./AppError');

const BANK_DETAIL_FIELDS = ['paymentBankName', 'paymentAccountName', 'paymentAccountNumber'];

const CHANGE_TYPES = {
  COMMUNITY_PAYMENT_DETAILS: {
    label: 'Community payment account details',
    entityType: 'Community',
    fields: BANK_DETAIL_FIELDS,
    // Builds the {field: {from, to}} diff, skipping fields that aren't
    // actually changing so reviewers only see what's really different.
    buildDiff(current, proposed) {
      const diff = {};
      for (const field of BANK_DETAIL_FIELDS) {
        if (proposed[field] === undefined) continue;
        const from = current[field] ?? null;
        const to = proposed[field] === '' ? null : proposed[field];
        if (from !== to) diff[field] = { from, to };
      }
      return diff;
    },
    async apply(tx, entityId, diff) {
      const data = {};
      for (const [field, { to }] of Object.entries(diff)) data[field] = to;
      return tx.community.update({ where: { id: entityId }, data });
    },
  },
  // A project's budget is load-bearing for the fund/project financial trail
  // (see computeFundMoney's totalAllocated/remaining in fundController.js),
  // so once a project has any expenses logged against it, changing the
  // budget in either direction goes through committee approval rather than
  // a unilateral admin edit — an increase after the fact can just as easily
  // paper over overspending as a decrease can understate it.
  PROJECT_BUDGET: {
    label: 'Project budget',
    entityType: 'Project',
    fields: ['budget'],
    buildDiff(current, proposed) {
      const diff = {};
      if (proposed.budget === undefined) return diff;
      const from = Number(current.budget);
      const to = Number(proposed.budget);
      if (from !== to) diff.budget = { from, to };
      return diff;
    },
    async apply(tx, entityId, diff) {
      return tx.project.update({ where: { id: entityId }, data: { budget: diff.budget.to } });
    },
  },
};

function getChangeType(changeType) {
  const def = CHANGE_TYPES[changeType];
  if (!def) throw new AppError(`Unknown change type: ${changeType}`, 400);
  return def;
}

module.exports = { CHANGE_TYPES, getChangeType };
