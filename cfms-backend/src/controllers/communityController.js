const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Platform owner's view of all tenants on the SaaS platform.
const listCommunities = catchAsync(async (req, res) => {
  const communities = await prisma.community.findMany({
    include: { _count: { select: { users: true, funds: true, projects: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: communities });
});

const getCommunity = catchAsync(async (req, res) => {
  const community = await prisma.community.findUnique({ where: { id: req.params.id } });
  if (!community) throw new AppError('Community not found', 404);
  res.json({ success: true, data: community });
});

const getMyCommunity = catchAsync(async (req, res) => {
  const community = await prisma.community.findUnique({ where: { id: req.user.communityId } });
  if (!community) throw new AppError('Community not found', 404);
  res.json({ success: true, data: community });
});

const updateMyCommunity = catchAsync(async (req, res) => {
  const { name, address, contactInfo, paymentBankName, paymentAccountName, paymentAccountNumber } = req.body;
  const updated = await prisma.community.update({
    where: { id: req.user.communityId },
    data: { name, address, contactInfo, paymentBankName, paymentAccountName, paymentAccountNumber },
  });
  res.json({ success: true, data: updated });
});

module.exports = { listCommunities, getCommunity, getMyCommunity, updateMyCommunity };
