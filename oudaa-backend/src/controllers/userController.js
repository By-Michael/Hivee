const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { saveAvatarFile, deleteAvatarFile } = require('../config/storage');

// PATCH /users/me/preferences — shallow-merges the posted keys into the
// user's stored preferences JSON, rather than requiring the whole object
// every time. This is what backs theme, sidebar-collapsed, default export
// format, and per-category notification mutes — all previously separate
// localStorage keys, now a single database column so they follow the user
// to any device/browser they sign into.
const updatePreferences = catchAsync(async (req, res) => {
  const current = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { preferences: true },
  });

  const merged = { ...(current?.preferences || {}), ...(req.body || {}) };

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { preferences: merged },
    select: { preferences: true },
  });

  res.json({ success: true, data: updated.preferences });
});

const uploadAvatar = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('An image file is required', 422);

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { avatarStorageKey: true },
  });

  const { avatarUrl, storageKey } = await saveAvatarFile(req.file);

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatarUrl, avatarStorageKey: storageKey },
    select: { avatarUrl: true },
  });

  // Best-effort cleanup of the old file, after the new one is safely
  // recorded — same ordering as receipt replacement flows in this codebase.
  if (user?.avatarStorageKey) {
    deleteAvatarFile(user.avatarStorageKey).catch(() => {});
  }

  res.json({ success: true, data: { avatarUrl: updated.avatarUrl } });
});

const deleteAvatar = catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { avatarStorageKey: true },
  });

  await prisma.user.update({
    where: { id: req.user.id },
    data: { avatarUrl: null, avatarStorageKey: null },
  });

  if (user?.avatarStorageKey) {
    deleteAvatarFile(user.avatarStorageKey).catch(() => {});
  }

  res.json({ success: true, message: 'Avatar removed' });
});

module.exports = { updatePreferences, uploadAvatar, deleteAvatar };
