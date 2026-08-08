const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');

const requestInclude = {
  fromUser: { select: { id: true, fullName: true, email: true } },
  toResident: { include: { user: { select: { id: true, fullName: true, email: true } } } },
  approvals: { include: { member: { select: { id: true, fullName: true } } } },
};

// A committee member initiates handing their seat to another resident.
const createTransferRequest = catchAsync(async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    throw new AppError('Only a committee member can initiate a transfer', 403);
  }

  const target = await prisma.resident.findFirst({
    where: { id: req.body.toResidentId, user: { communityId: req.communityId } },
    include: { user: true },
  });
  if (!target) throw new AppError('Resident not found in this community', 404);
  if (target.user.role === 'ADMIN') throw new AppError('That resident is already a committee member', 422);

  const existing = await prisma.committeeTransferRequest.findFirst({
    where: { fromUserId: req.user.id, status: { in: ['PENDING_COMMITTEE', 'PENDING_RECIPIENT'] } },
  });
  if (existing) throw new AppError('You already have a pending transfer request', 422);

  const otherMembers = await prisma.user.findMany({
    where: { communityId: req.communityId, role: 'ADMIN', id: { not: req.user.id } },
  });

  const request = await prisma.committeeTransferRequest.create({
    data: {
      communityId: req.communityId,
      fromUserId: req.user.id,
      toResidentId: target.id,
      status: otherMembers.length > 0 ? 'PENDING_COMMITTEE' : 'PENDING_RECIPIENT',
      approvals: {
        create: otherMembers.map((m) => ({ committeeUserId: m.id })),
      },
    },
    include: requestInclude,
  });

  await recordAudit(req, { action: 'CREATE', entityType: 'CommitteeTransferRequest', entityId: request.id, description: `Requested to transfer committee seat to ${target.user.fullName}` });
  res.status(201).json({ success: true, data: request });
});

// Everything relevant to the current user: requests they can vote on,
// requests they're the target of, and their own outgoing request(s).
const listMyTransferItems = catchAsync(async (req, res) => {
  const resident = req.user.role === 'RESIDENT'
    ? await prisma.resident.findUnique({ where: { userId: req.user.id } })
    : null;

  const [asApprover, asRecipient, asRequester] = await Promise.all([
    req.user.role === 'ADMIN'
      ? prisma.committeeTransferRequest.findMany({
          where: {
            communityId: req.communityId,
            status: 'PENDING_COMMITTEE',
            fromUserId: { not: req.user.id },
            approvals: { some: { committeeUserId: req.user.id, decision: 'PENDING' } },
          },
          include: requestInclude,
        })
      : [],
    resident
      ? prisma.committeeTransferRequest.findMany({
          where: { toResidentId: resident.id, status: 'PENDING_RECIPIENT', recipientDecision: 'PENDING' },
          include: requestInclude,
        })
      : [],
    prisma.committeeTransferRequest.findMany({
      where: { fromUserId: req.user.id, status: { in: ['PENDING_COMMITTEE', 'PENDING_RECIPIENT'] } },
      include: requestInclude,
    }),
  ]);

  res.json({ success: true, data: { asApprover, asRecipient, asRequester } });
});

// A fellow committee member votes on a pending request.
const respondAsCommittee = catchAsync(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new AppError('Only a committee member can vote on this', 403);
  const { decision } = req.body; // 'APPROVED' | 'REJECTED'

  const request = await prisma.committeeTransferRequest.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { approvals: true },
  });
  if (!request) throw new AppError('Transfer request not found', 404);
  if (request.status !== 'PENDING_COMMITTEE') throw new AppError('This request is no longer awaiting committee approval', 422);
  if (request.fromUserId === req.user.id) throw new AppError('You cannot vote on your own transfer request', 422);

  const approval = request.approvals.find((a) => a.committeeUserId === req.user.id);
  if (!approval) throw new AppError('You are not eligible to vote on this request', 403);
  if (approval.decision !== 'PENDING') throw new AppError('You already responded to this request', 422);

  await prisma.committeeTransferApproval.update({
    where: { id: approval.id },
    data: { decision, respondedAt: new Date() },
  });

  if (decision === 'REJECTED') {
    const updated = await prisma.committeeTransferRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', resolvedAt: new Date() },
      include: requestInclude,
    });
    return res.json({ success: true, data: updated });
  }

  // Check whether every other committee member has now approved.
  const remaining = await prisma.committeeTransferApproval.count({
    where: { requestId: request.id, decision: { not: 'APPROVED' } },
  });

  const updated = await prisma.committeeTransferRequest.update({
    where: { id: request.id },
    data: remaining === 0 ? { status: 'PENDING_RECIPIENT' } : {},
    include: requestInclude,
  });

  res.json({ success: true, data: updated });
});

// The chosen resident accepts or declines becoming a committee member.
const respondAsRecipient = catchAsync(async (req, res) => {
  const { decision } = req.body; // 'APPROVED' | 'REJECTED'

  const resident = await prisma.resident.findUnique({ where: { userId: req.user.id } });
  if (!resident) throw new AppError('Resident profile not found', 404);

  const request = await prisma.committeeTransferRequest.findFirst({
    where: { id: req.params.id, communityId: req.communityId, toResidentId: resident.id },
  });
  if (!request) throw new AppError('Transfer request not found', 404);
  if (request.status !== 'PENDING_RECIPIENT') throw new AppError('This request is not awaiting your response', 422);

  if (decision === 'REJECTED') {
    const updated = await prisma.committeeTransferRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', recipientDecision: 'REJECTED', resolvedAt: new Date() },
      include: requestInclude,
    });
    return res.json({ success: true, data: updated });
  }

  // Execute the transfer atomically: swap committee seat.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: request.fromUserId }, data: { role: 'RESIDENT' } });
    await tx.user.update({ where: { id: resident.userId }, data: { role: 'ADMIN' } });
    return tx.committeeTransferRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', recipientDecision: 'APPROVED', resolvedAt: new Date() },
      include: requestInclude,
    });
  });

  await recordAudit(req, { action: 'UPDATE', entityType: 'CommitteeTransferRequest', entityId: request.id, description: `Accepted committee seat transfer, becoming a committee member` });
  res.json({ success: true, data: updated });
});

const cancelTransferRequest = catchAsync(async (req, res) => {
  const request = await prisma.committeeTransferRequest.findFirst({
    where: { id: req.params.id, communityId: req.communityId, fromUserId: req.user.id },
  });
  if (!request) throw new AppError('Transfer request not found', 404);
  if (!['PENDING_COMMITTEE', 'PENDING_RECIPIENT'].includes(request.status)) {
    throw new AppError('This request can no longer be cancelled', 422);
  }
  const updated = await prisma.committeeTransferRequest.update({
    where: { id: request.id },
    data: { status: 'CANCELLED', resolvedAt: new Date() },
    include: requestInclude,
  });
  res.json({ success: true, data: updated });
});

module.exports = {
  createTransferRequest,
  listMyTransferItems,
  respondAsCommittee,
  respondAsRecipient,
  cancelTransferRequest,
};
