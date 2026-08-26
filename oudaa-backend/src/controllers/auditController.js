const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');

// Every committee member (ADMIN) can view the full audit trail for their
// own community.
// There is deliberately no update/delete endpoint for this resource —
// the audit trail is append-only.
const listAuditLogs = catchAsync(async (req, res) => {
  const where = {};
  if (req.communityId) where.communityId = req.communityId;

  const { action, entityType, actorId, from, to } = req.query;
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (actorId) where.actorId = actorId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const take = Math.min(Number(req.query.limit) || 200, 500);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });

  res.json({ success: true, data: logs });
});

module.exports = { listAuditLogs };
