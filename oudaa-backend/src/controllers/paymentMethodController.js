const crypto = require('crypto');
const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createPendingChange } = require('./pendingChangeController');

// Hivee only supports 2 payment providers total (CBE and Telebirr — see
// PaymentProvider in schema.prisma) and there are no plans to add more, so
// a community is capped at 2 registered payment methods. Enforced here
// rather than left to the UI so it can't be bypassed by calling the API
// directly.
const MAX_PAYMENT_METHODS = 2;

// Telebirr rows never carry bank fields, bank rows never carry
// fullName/phoneNumber — strip whichever half doesn't apply so stale data
// from a provider switch doesn't linger and confuse the resident picker.
function scrubByProvider(data) {
  const out = { ...data };
  if (out.provider === 'TELEBIRR') {
    out.bankName = null;
    out.accountName = null;
    out.accountNumber = null;
  } else if (out.provider) {
    out.fullName = null;
    out.phoneNumber = null;
  }
  return out;
}

function assertProviderFieldsComplete(data) {
  const needsBank = data.provider !== 'TELEBIRR';
  if (needsBank && !data.accountNumber) {
    throw new AppError('This provider needs an account number', 422);
  }
  if (!needsBank && (!data.fullName || !data.phoneNumber)) {
    throw new AppError('Telebirr needs a full name and phone number', 422);
  }
}

// Residents (and any unauthenticated-in-community context) only ever see
// active methods — an admin toggling one off should immediately remove it
// from the resident "pay with" picker without residents seeing a
// half-retired option. Admins see everything (including inactive) so they
// can re-enable one later instead of re-typing it from scratch.
const listPaymentMethods = catchAsync(async (req, res) => {
  const where = { communityId: req.communityId };
  if (req.user.role !== 'ADMIN') where.isActive = true;

  const methods = await prisma.communityPaymentMethod.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: methods, maxPaymentMethods: MAX_PAYMENT_METHODS });
});

// Adding, editing, or removing a payment method changes where every
// resident is told to send money — same stakes as the legacy single bank
// account fields (see communityController.updateMyCommunity), so all
// three go through the PendingChange committee-approval flow instead of
// applying instantly. A sole committee member still gets it applied right
// away (see createPendingChange) — nobody else to approve it.
const createPaymentMethod = catchAsync(async (req, res) => {
  const scrubbed = scrubByProvider(req.body);
  assertProviderFieldsComplete(scrubbed);

  const existingCount = await prisma.communityPaymentMethod.count({ where: { communityId: req.communityId } });
  const pendingCreateCount = await prisma.pendingChange.count({
    where: { communityId: req.communityId, changeType: 'PAYMENT_METHOD_CREATE', status: 'PENDING' },
  });
  if (existingCount + pendingCreateCount >= MAX_PAYMENT_METHODS) {
    throw new AppError(`This community already has the maximum of ${MAX_PAYMENT_METHODS} payment methods (CBE and Telebirr).`, 422);
  }

  // Generated up front so it can double as the PendingChange's entityId —
  // the row doesn't exist yet, so there's nothing else to key it on until
  // it's actually created on approval (see PAYMENT_METHOD_CREATE.apply).
  const newId = crypto.randomUUID();

  const result = await createPendingChange(req, {
    changeType: 'PAYMENT_METHOD_CREATE',
    entityId: newId,
    currentEntity: {},
    proposedFields: scrubbed,
  });

  res.status(201).json({
    success: true,
    data: result.applied ? result.entity : null,
    pendingChange: result.pending || null,
    message: result.pending
      ? 'Needs every other committee member to approve before it takes effect.'
      : "Added — you're the only committee member, so no separate approval was needed.",
  });
});

const updatePaymentMethod = catchAsync(async (req, res) => {
  const method = await prisma.communityPaymentMethod.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!method) throw new AppError('Payment method not found', 404);

  const merged = scrubByProvider({ ...method, ...req.body });
  assertProviderFieldsComplete(merged);

  const result = await createPendingChange(req, {
    changeType: 'PAYMENT_METHOD_UPDATE',
    entityId: method.id,
    currentEntity: method,
    proposedFields: merged,
  });

  res.json({
    success: true,
    data: result.applied ? result.entity : (result.noChange ? method : null),
    pendingChange: result.pending || null,
    message: result.noChange
      ? 'No changes to save.'
      : result.pending
        ? 'Needs every other committee member to approve before it takes effect.'
        : "Updated — you're the only committee member, so no separate approval was needed.",
  });
});

const deletePaymentMethod = catchAsync(async (req, res) => {
  const method = await prisma.communityPaymentMethod.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!method) throw new AppError('Payment method not found', 404);

  const result = await createPendingChange(req, {
    changeType: 'PAYMENT_METHOD_DELETE',
    entityId: method.id,
    currentEntity: method,
    proposedFields: {},
  });

  res.json({
    success: true,
    removed: !!result.applied,
    pendingChange: result.pending || null,
    message: result.pending
      ? 'Removal needs every other committee member to approve before it takes effect.'
      : "Removed — you're the only committee member, so no separate approval was needed.",
  });
});

module.exports = { listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod };
