const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/tokens');

const REFRESH_COOKIE_NAME = 'cfms_refresh_token';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth',
};

async function issueTokenPair(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTS);
  return accessToken;
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

/**
 * Public SaaS signup: onboards a brand-new tenant (Community) plus its
 * first ADMIN user in a single transaction.
 */
const registerCommunity = catchAsync(async (req, res) => {
  const { community, admin } = req.body;

  const existing = await prisma.user.findUnique({ where: { email: admin.email } });
  if (existing) throw new AppError('Email already in use', 409);

  const passwordHash = await bcrypt.hash(admin.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const createdCommunity = await tx.community.create({ data: community });
    const createdAdmin = await tx.user.create({
      data: {
        communityId: createdCommunity.id,
        fullName: admin.fullName,
        email: admin.email,
        passwordHash,
        role: 'ADMIN',
      },
    });
    return { createdCommunity, createdAdmin };
  });

  const accessToken = await issueTokenPair(res, result.createdAdmin);

  res.status(201).json({
    success: true,
    data: {
      community: result.createdCommunity,
      user: sanitizeUser(result.createdAdmin),
      accessToken,
    },
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('Invalid email or password', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid email or password', 401);

  const accessToken = await issueTokenPair(res, user);

  res.json({
    success: true,
    data: { user: sanitizeUser(user), accessToken },
  });
});

const refresh = catchAsync(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  if (!token) throw new AppError('Refresh token missing', 401);

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw new AppError('Refresh token is no longer valid', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new AppError('User no longer exists', 401);

  // Rotate: revoke the used token and issue a brand-new pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  });

  const accessToken = await issueTokenPair(res, user);

  res.json({ success: true, data: { accessToken } });
});

const logout = catchAsync(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  if (token) {
    await prisma.refreshToken
      .updateMany({
        where: { tokenHash: hashToken(token) },
        data: { revoked: true },
      })
      .catch(() => {});
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  res.json({ success: true, message: 'Logged out' });
});

const me = catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { resident: true, community: true },
  });
  res.json({ success: true, data: sanitizeUser(user) });
});

/**
 * Self-service password change. Requires the caller's current password so
 * a hijacked session alone can't lock the real owner out, and revokes every
 * outstanding refresh token so other logged-in sessions are forced to
 * re-authenticate with the new password.
 */
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw new AppError('User no longer exists', 401);

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError('Current password is incorrect', 401);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
  ]);

  res.json({ success: true, message: 'Password updated' });
});

module.exports = { registerCommunity, login, refresh, logout, me, changePassword };
