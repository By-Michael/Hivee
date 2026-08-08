const AppError = require('../utils/AppError');

/**
 * Multi-tenancy guard. Every ADMIN/RESIDENT must belong to a community, and
 * every query in the app must be filtered by that communityId so tenants
 * can never see each other's data. SUPER_ADMIN is platform staff and is
 * allowed to bypass this (e.g. to support any community), so it's excluded.
 *
 * Attaches req.communityId for controllers to use directly in `where` clauses.
 */
module.exports = function tenantScope(req, res, next) {
  if (req.user.role === 'SUPER_ADMIN') {
    // SUPER_ADMIN may target a specific community via ?communityId= for
    // support/reporting purposes; otherwise operates platform-wide.
    req.communityId = req.query.communityId || null;
    return next();
  }

  if (!req.user.communityId) {
    return next(new AppError('User is not associated with a community', 403));
  }

  req.communityId = req.user.communityId;
  next();
};
