const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// ADMIN registers a resident under their own community.
const createResident = catchAsync(async (req, res) => {
  const { fullName, email, password, unitNumber, status } = req.body;

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
        create: { unitNumber, status: status || 'ACTIVE' },
      },
    },
    include: { resident: true },
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

const updateResident = catchAsync(async (req, res) => {
  const { fullName, unitNumber, status } = req.body;

  const resident = await prisma.resident.findFirst({
    where: { id: req.params.id, user: { communityId: req.communityId } },
  });
  if (!resident) throw new AppError('Resident not found', 404);

  const updated = await prisma.resident.update({
    where: { id: resident.id },
    data: {
      unitNumber,
      status,
      user: fullName ? { update: { fullName } } : undefined,
    },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });

  res.json({ success: true, data: updated });
});

const deleteResident = catchAsync(async (req, res) => {
  const resident = await prisma.resident.findFirst({
    where: { id: req.params.id, user: { communityId: req.communityId } },
  });
  if (!resident) throw new AppError('Resident not found', 404);

  // Deleting the User cascades to Resident (see schema onDelete: Cascade).
  await prisma.user.delete({ where: { id: resident.userId } });
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

module.exports = {
  createResident,
  listResidents,
  getResident,
  updateResident,
  deleteResident,
  getMyResidentProfile,
};
