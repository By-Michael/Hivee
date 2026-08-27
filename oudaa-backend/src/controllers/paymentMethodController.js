const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');

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
  res.json({ success: true, data: methods });
});

const createPaymentMethod = catchAsync(async (req, res) => {
  const method = await prisma.communityPaymentMethod.create({
    data: { ...scrubByProvider(req.body), communityId: req.communityId },
  });
  await recordAudit(req, {
    action: 'CREATE',
    entityType: 'CommunityPaymentMethod',
    entityId: method.id,
    description: `Added payment method "${method.label}" (${method.provider})`,
  });
  res.status(201).json({ success: true, data: method });
});

const updatePaymentMethod = catchAsync(async (req, res) => {
  const method = await prisma.communityPaymentMethod.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!method) throw new AppError('Payment method not found', 404);

  const merged = scrubByProvider({ ...method, ...req.body });
  const nextProvider = merged.provider;
  const needsBank = nextProvider !== 'TELEBIRR';
  if (needsBank && !merged.accountNumber) {
    throw new AppError('This provider needs an account number', 422);
  }
  if (!needsBank && (!merged.fullName || !merged.phoneNumber)) {
    throw new AppError('Telebirr needs a full name and phone number', 422);
  }

  const updated = await prisma.communityPaymentMethod.update({
    where: { id: method.id },
    data: {
      provider: merged.provider,
      label: merged.label,
      bankName: merged.bankName,
      accountName: merged.accountName,
      accountNumber: merged.accountNumber,
      fullName: merged.fullName,
      phoneNumber: merged.phoneNumber,
      isActive: merged.isActive,
      sortOrder: merged.sortOrder,
    },
  });
  await recordAudit(req, {
    action: 'UPDATE',
    entityType: 'CommunityPaymentMethod',
    entityId: method.id,
    description: `Updated payment method "${updated.label}"`,
  });
  res.json({ success: true, data: updated });
});

const deletePaymentMethod = catchAsync(async (req, res) => {
  const method = await prisma.communityPaymentMethod.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!method) throw new AppError('Payment method not found', 404);

  // Payments that used this method keep their record (paymentMethodId just
  // goes null via the FK's ON DELETE SET NULL) — deleting a payment method
  // must never delete or orphan financial history.
  await prisma.communityPaymentMethod.delete({ where: { id: method.id } });
  await recordAudit(req, {
    action: 'DELETE',
    entityType: 'CommunityPaymentMethod',
    entityId: method.id,
    description: `Removed payment method "${method.label}"`,
  });
  res.json({ success: true, message: 'Payment method removed' });
});

module.exports = { listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod };
