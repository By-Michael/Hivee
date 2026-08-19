const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/tokens');
const prisma = require('../config/prisma');

/**
 * Verifies the Bearer access token and attaches the current user
 * (id, role, communityId) to req.user. Rejects if the user no longer
 * exists (e.g. deleted after the token was issued).
 */
module.exports = async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError('Authentication required', 401);
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      throw new AppError('Invalid or expired access token', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError('User no longer exists', 401);
    }

    req.user = {
      id: user.id,
      role: user.role,
      communityId: user.communityId,
      email: user.email,
      fullName: user.fullName,
    };

    next();
  } catch (err) {
    next(err);
  }
};
