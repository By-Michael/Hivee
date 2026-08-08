const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');
const { phoneSearchKeyFor } = require('../utils/phone');

// ADMIN registers a resident under their own community.
const createResident = catchAsync(async (req, res) => {
  const { fullName, email, password, unitNumber, status, phone, idNumber, address, ownerType } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('Email already in use', 409);

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      communityId: req.communityId,
      fullName,
      email,
      passwordHash,
      role: 'RESIDENT',
      resident: {
        create: {
          unitNumber,
          status: status || 'ACTIVE',
          phone,
          phoneSearchKey: phoneSearchKeyFor(phone),
          idNumber,
          address,
          ownerType: ownerType || 'OWNER',
        },
      },
    },
    include: { resident: true },
  });

  await recordAudit(req, {
    action: 'CREATE',
    entityType: 'Resident',
    entityId: user.resident?.id,
    description: `Added resident "${fullName}" (unit ${unitNumber})`,
  });

  const { passwordHash: _omit, ...safeUser } = user;
  res.status(201).json({ success: true, data: safeUser });
});

// ADMIN: list all residents in their community. RESIDENT: not allowed (route-guarded).
const listResidents = catchAsync(async (req, res) => {
  const residents = await prisma.resident.findMany({
    where: { user: { communityId: req.communityId } },
    include: { user: { select: { id: true, fullName: true, email: true, createdAt: true } } },
    orderBy: { joinedAt: 'desc' },
  });
  res.json({ success: true, data: residents });
});

const getResident = catchAsync(async (req, res) => {
  const resident = await prisma.resident.findFirst({
    where: { id: req.params.id, user: { communityId: req.communityId } },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  if (!resident) throw new AppError('Resident not found', 404);
  res.json({ success: true, data: resident });
});

// ADMIN: full detail for one resident — profile fields plus every fee this
// resident owes, cross-referenced against their payments, so the admin can
// see outstanding/missing payments in a single call.
const getResidentSummary = catchAsync(async (req, res) => {
  const resident = await prisma.resident.findFirst({
    where: { id: req.params.id, user: { communityId: req.communityId } },
    include: {
      user: { select: { id: true, fullName: true, email: true, createdAt: true } },
      payments: {
        include: { fee: { select: { id: true, name: true, amount: true, frequency: true } } },
        orderBy: { paidAt: 'desc' },
      },
    },
  });
  if (!resident) throw new AppError('Resident not found', 404);

  const fees = await prisma.fee.findMany({ where: { communityId: req.communityId } });

  const paidOrPendingFeeIds = new Set(
    resident.payments.filter((p) => p.status !== 'REJECTED').map((p) => p.feeId)
  );
  const missingPayments = fees
    .filter((f) => !paidOrPendingFeeIds.has(f.id))
    .map((f) => ({ feeId: f.id, name: f.name, amount: f.amount, frequency: f.frequency }));

  res.json({ success: true, data: { resident, missingPayments } });
});

const updateResident = catchAsync(async (req, res) => {
  const { fullName, email, unitNumber, status, phone, idNumber, address, ownerType } = req.body;

  const resident = await prisma.resident.findFirst({
    where: { id: req.params.id, user: { communityId: req.communityId } },
    include: { user: true },
  });
  if (!resident) throw new AppError('Resident not found', 404);

  if (email && email !== resident.user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already in use', 409);
  }

  const userUpdate = {};
  if (fullName !== undefined) userUpdate.fullName = fullName;
  if (email !== undefined) userUpdate.email = email;

  const updated = await prisma.resident.update({
    where: { id: resident.id },
    data: {
      unitNumber,
      status,
      phone,
      phoneSearchKey: phone !== undefined ? phoneSearchKeyFor(phone) : undefined,
      idNumber,
      address,
      ownerType,
      user: Object.keys(userUpdate).length ? { update: userUpdate } : undefined,
    },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });

  await recordAudit(req, {
    action: 'UPDATE',
    entityType: 'Resident',
    entityId: resident.id,
    description: `Updated resident "${updated.user.fullName}" (unit ${updated.unitNumber})`,
  });

  res.json({ success: true, data: updated });
});

const deleteResident = catchAsync(async (req, res) => {
  const resident = await prisma.resident.findFirst({
    where: { id: req.params.id, user: { communityId: req.communityId } },
    include: { user: true },
  });
  if (!resident) throw new AppError('Resident not found', 404);

  // Deleting the User cascades to Resident (see schema onDelete: Cascade).
  await prisma.user.delete({ where: { id: resident.userId } });

  await recordAudit(req, {
    action: 'DELETE',
    entityType: 'Resident',
    entityId: resident.id,
    description: `Removed resident "${resident.user.fullName}" (unit ${resident.unitNumber})`,
  });

  res.json({ success: true, message: 'Resident removed' });
});

// A resident viewing their own profile.
const getMyResidentProfile = catchAsync(async (req, res) => {
  const resident = await prisma.resident.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  if (!resident) throw new AppError('Resident profile not found', 404);
  res.json({ success: true, data: resident });
});

// A resident updating their own contact details. Deliberately narrow:
// only phone/address are self-editable — unit, status, ID number,
// owner/renter type, and email stay committee-managed.
const updateMyResidentProfile = catchAsync(async (req, res) => {
  const { phone, address } = req.body;

  const resident = await prisma.resident.findUnique({ where: { userId: req.user.id } });
  if (!resident) throw new AppError('Resident profile not found', 404);

  const updated = await prisma.resident.update({
    where: { id: resident.id },
    data: { phone, address },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });

  await recordAudit(req, {
    action: 'UPDATE',
    entityType: 'Resident',
    entityId: resident.id,
    description: `${req.user.fullName} updated their own contact details`,
  });

  res.json({ success: true, data: updated });
});

module.exports = {
  createResident,
  listResidents,
  getResident,
  getResidentSummary,
  updateResident,
  deleteResident,
  getMyResidentProfile,
  updateMyResidentProfile,
};
