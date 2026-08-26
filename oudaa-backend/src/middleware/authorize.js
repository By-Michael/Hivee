const AppError = require('../utils/AppError');

/**
 * Restricts a route to specific roles.
 * Usage: router.post('/fees', authenticate, authorize('ADMIN'), createFee)
 */
module.exports = function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};
