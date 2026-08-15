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

  // Unit number, ID number, and phone must each be unique within the
  // community — two residents can't share a unit, ID, or phone number.
  const [unitClash, idClash, phoneClash] = await Promise.all([
    unitNumber
      ? prisma.resident.findFirst({ where: { unitNumber, user: { communityId: req.communityId } } })
      : null,
    idNumber
      ? prisma.resident.findFirst({ where: { idNumber, user: { communityId: req.communityId } } })
      : null,
    phone
      ? prisma.resident.findFirst({ where: { phone, user: { communityId: req.communityId } } })
      : null,
  ]);
  if (unitClash) throw new AppError('That unit / house number is already assigned to another resident', 409);
  if (idClash) throw new AppError('That ID number is already registered to another resident', 409);
  if (phoneClash) throw new AppError('That phone number is already registered to another resident', 409);

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
//
// Paginated: with communities seeded to thousands of residents, returning
// every row unconditionally meant one request could ship megabytes of JSON
// and take many seconds. `page`/`limit` are optional so existing callers
// that don't pass them still work (default: first 200, generous enough for
// small/medium communities to keep behaving exactly as before), but any
// community above that size now needs to explicitly page through results.
// `search` lets the caller filter server-side instead of pulling everything
// down to filter client-side.
const listResidents = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const search = (req.query.search || '').trim();

  const where = {
    user: { communityId: req.communityId },
    ...(search
      ? {
          OR: [
            { user: { fullName: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
            { unitNumber: { contains: search, mode: 'insensitive' } },
            { idNumber: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [residents, total, activeTotal] = await Promise.all([
    prisma.resident.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true, createdAt: true, role: true } } },
      orderBy: { joinedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.resident.count({ where }),
    // Counted separately (not derived from the page in hand) so the
    // dashboard's "active residents" figure stays correct even when only
    // one page of residents has actually been fetched.
    prisma.resident.count({ where: { ...where, status: 'ACTIVE' } }),
  ]);

  res.json({
    success: true,
    data: residents,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), activeTotal },
  });
});

const getResident = catchAsync(async (req, res) => {
  const resident = await prisma.resident.findFirst({
    where: { id: req.params.id, user: { communityId: req.communityId } },
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
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
      user: { select: { id: true, fullName: true, email: true, createdAt: true, role: true } },
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

  // Same uniqueness rules as create — excluding this resident's own
  // current record, so saving a resident's unchanged unit/ID/phone
  // doesn't falsely flag a clash against itself.
  const [unitClash, idClash, phoneClash] = await Promise.all([
    unitNumber
      ? prisma.resident.findFirst({ where: { unitNumber, id: { not: resident.id }, user: { communityId: req.communityId } } })
      : null,
    idNumber
      ? prisma.resident.findFirst({ where: { idNumber, id: { not: resident.id }, user: { communityId: req.communityId } } })
      : null,
    phone
      ? prisma.resident.findFirst({ where: { phone, id: { not: resident.id }, user: { communityId: req.communityId } } })
      : null,
  ]);
  if (unitClash) throw new AppError('That unit / house number is already assigned to another resident', 409);
  if (idClash) throw new AppError('That ID number is already registered to another resident', 409);
  if (phoneClash) throw new AppError('That phone number is already registered to another resident', 409);

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

  // Committee members (User.role === 'ADMIN') keep a Resident record even
  // after taking a committee seat, so they still appear in this list —
  // but they can't be removed from here.
  if (resident.user.role === 'ADMIN') {
    if (resident.userId === req.user.id) {
      throw new AppError("You're a committee member, so you can't delete yourself here. Use Profile settings to transfer your committee seat to another resident first.", 422);
    }
    throw new AppError('This person is a committee member and can\'t be removed from the residents panel.', 422);
  }

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
