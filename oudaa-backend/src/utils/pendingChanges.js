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
      // Only the account NUMBER identifies a distinct bank account for
      // verification purposes (bank/holder name changes alone, e.g. a
      // typo fix, don't create a new account to reconcile against) — so
      // only snapshot history when the number is actually changing away
      // from a real previous value.
      if (diff.paymentAccountNumber && diff.paymentAccountNumber.from) {
        const before = await tx.community.findUnique({ where: { id: entityId } });
        if (before) {
          await tx.communityBankAccountHistory.create({
            data: {
              communityId: entityId,
              bankName: before.paymentBankName,
              accountName: before.paymentAccountName,
              accountNumber: before.paymentAccountNumber,
            },
          });
        }
      }
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
  // Projects can never be deleted (see projectController — the DELETE
  // route was removed entirely). Cancelling is the only way to close out a
  // project that shouldn't continue, and since it's effectively
  // irreversible in practice (nothing un-cancels a project), it always
  // requires full committee approval and a stated reason — regardless of
  // whether the project has expenses logged yet, unlike PROJECT_BUDGET
  // above which only escalates once there's a financial trail to protect.
  PROJECT_CANCELLATION: {
    label: 'Project cancellation',
    entityType: 'Project',
    fields: ['status', 'cancelReason'],
    buildDiff(current, proposed) {
      if (current.status === 'CANCELLED') {
        throw new AppError('This project is already cancelled', 422);
      }
      const reason = (proposed.cancelReason || '').trim();
      if (!reason) throw new AppError('A cancellation reason is required', 400);
      return {
        status: { from: current.status, to: 'CANCELLED' },
        cancelReason: { from: current.cancelReason ?? null, to: reason },
      };
    },
    async apply(tx, entityId, diff) {
      return tx.project.update({
        where: { id: entityId },
        data: { status: 'CANCELLED', cancelReason: diff.cancelReason.to },
      });
    },
  },
};

// ---------------------------------------------------------------------
// Community payment methods (CBE / Telebirr). Hivee caps every community
// at 2 methods total (one CBE + one Telebirr — see the 2-method limit
// enforced in paymentMethodController.js), so every add, edit, or removal
// changes what residents are told to pay into and goes through the same
// committee sign-off as the legacy single-account fields above, instead
// of applying the instant a single admin clicks Save.
// ---------------------------------------------------------------------
const PAYMENT_METHOD_FIELDS = [
  'provider', 'label', 'bankName', 'accountName', 'accountNumber', 'fullName', 'phoneNumber', 'isActive',
];

CHANGE_TYPES.PAYMENT_METHOD_CREATE = {
  label: 'New payment method',
  entityType: 'CommunityPaymentMethod',
  fields: PAYMENT_METHOD_FIELDS,
  // `current` is always {} here (the row doesn't exist yet) — every field
  // is "new", so the diff is just the full proposed row shown as from
  // (empty) → value. `proposed` must already be fully scrubbed/merged by
  // the controller (every field defined, never `undefined`) since there's
  // no existing row to fall back to for the fields the admin didn't touch.
  buildDiff(current, proposed) {
    const diff = {};
    for (const field of PAYMENT_METHOD_FIELDS) {
      diff[field] = { from: null, to: proposed[field] ?? null };
    }
    return diff;
  },
  // `communityId` is passed through by pendingChangeController so the new
  // row can be created with it — entityId here is the payment method's own
  // (pre-generated) id, not the community's, unlike the other change types
  // above where entityId already identifies an existing row directly.
  async apply(tx, entityId, diff, communityId) {
    const data = { id: entityId, communityId };
    for (const [field, { to }] of Object.entries(diff)) data[field] = to;
    return tx.communityPaymentMethod.create({ data });
  },
};

CHANGE_TYPES.PAYMENT_METHOD_UPDATE = {
  label: 'Payment method update',
  entityType: 'CommunityPaymentMethod',
  fields: PAYMENT_METHOD_FIELDS,
  // `proposed` is the controller's fully merged + scrubbed row (existing
  // values overlaid with whatever the admin changed, provider-appropriate
  // fields nulled out) so a provider switch clears the other half's fields
  // in the diff even though the admin never explicitly touched them.
  buildDiff(current, proposed) {
    const diff = {};
    for (const field of PAYMENT_METHOD_FIELDS) {
      const from = current[field] ?? null;
      const to = proposed[field] ?? null;
      if (from !== to) diff[field] = { from, to };
    }
    return diff;
  },
  async apply(tx, entityId, diff) {
    const data = {};
    for (const [field, { to }] of Object.entries(diff)) data[field] = to;
    return tx.communityPaymentMethod.update({ where: { id: entityId }, data });
  },
};

CHANGE_TYPES.PAYMENT_METHOD_DELETE = {
  label: 'Payment method removal',
  entityType: 'CommunityPaymentMethod',
  fields: [],
  // Not a field-level diff — just enough for reviewers to see what's being
  // removed. `current` is the existing row the controller looked up.
  buildDiff(current) {
    return {
      label: { from: current.label, to: null },
      removed: { from: false, to: true },
    };
  },
  async apply(tx, entityId) {
    // Same as the old instant-delete: payments that used this method keep
    // their record (paymentMethodId goes null via the FK's ON DELETE SET
    // NULL) — removing a payment method must never delete or orphan
    // financial history. If it's already gone (e.g. a race with another
    // approval), treat it as a no-op rather than failing the whole request.
    await tx.communityPaymentMethod.deleteMany({ where: { id: entityId } });
  },
};

function getChangeType(changeType) {
  const def = CHANGE_TYPES[changeType];
  if (!def) throw new AppError(`Unknown change type: ${changeType}`, 400);
  return def;
}

module.exports = { CHANGE_TYPES, getChangeType };
