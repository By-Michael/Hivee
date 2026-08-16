const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');
const { CHANGE_TYPES, getChangeType } = require('../utils/pendingChanges');

// Everyone's settings for every changeType, so a member can see who has
// auto-approval on for what even for change types that aren't theirs to
// toggle — read-only for anyone else's rows, enforced by the update
// endpoint below checking userId, not by hiding data here.
const listAutoApprovals = catchAsync(async (req, res) => {
  const rows = await prisma.committeeAutoApproval.findMany({
    where: { communityId: req.communityId },
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({
    success: true,
    data: {
      changeTypes: Object.entries(CHANGE_TYPES).map(([key, def]) => ({ changeType: key, label: def.label })),
      settings: rows,
    },
  });
});

// Enabling requires acknowledging the accountability warning in the same
// request (acknowledged: true) — the frontend shows the confirmation
// dialog first, but this is re-checked server-side so the warning can't be
// skipped by calling the API directly. Disabling never needs it.
const upsertAutoApproval = catchAsync(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new AppError('Only a committee member can set this', 403);

  const { changeType, enabled, expiresInDays, acknowledged } = req.body;
  getChangeType(changeType); // throws 400 if not a real change type

  if (enabled) {
    if (!acknowledged) {
      throw new AppError('You must acknowledge the accountability notice to enable auto-approval', 400);
    }
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
      throw new AppError('expiresInDays must be between 1 and 365', 400);
    }
  }

  const existing = await prisma.committeeAutoApproval.findUnique({
    where: { userId_changeType: { userId: req.user.id, changeType } },
  });

  const data = enabled
    ? {
        enabled: true,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        acknowledgedAt: new Date(),
      }
    : { enabled: false };

  const setting = await prisma.committeeAutoApproval.upsert({
    where: { userId_changeType: { userId: req.user.id, changeType } },
    // acknowledgedAt/expiresAt are required columns, so a fresh disable-first
    // row still needs placeholder values — they're meaningless while
    // enabled=false and get overwritten for real the next time it's enabled.
    create: {
      userId: req.user.id,
      communityId: req.communityId,
      changeType,
      enabled: !!enabled,
      expiresAt: data.expiresAt || new Date(),
      acknowledgedAt: data.acknowledgedAt || new Date(),
    },
    update: data,
  });

  await recordAudit(req, {
    action: 'UPDATE',
    entityType: 'CommitteeAutoApproval',
    entityId: setting.id,
    description: enabled
      ? `Turned ON auto-approval for "${getChangeType(changeType).label}" requests for ${expiresInDays} day(s)`
      : `Turned OFF auto-approval for "${getChangeType(changeType).label}" requests`,
    metadata: { before: existing ? { enabled: existing.enabled, expiresAt: existing.expiresAt } : null, after: { enabled: setting.enabled, expiresAt: setting.expiresAt } },
  });

  res.json({ success: true, data: setting });
});

module.exports = { listAutoApprovals, upsertAutoApproval };
