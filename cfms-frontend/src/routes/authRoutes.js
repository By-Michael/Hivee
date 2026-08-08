const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const {
  registerCommunitySchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} = require('../validators/authValidators');

const router = express.Router();

// Throttle auth endpoints to blunt credential-stuffing / brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post(
  '/register-community',
  authLimiter,
  validate(registerCommunitySchema),
  authController.registerCommunity
);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.patch(
  '/change-password',
  authenticate,
  authLimiter,
  validate(changePasswordSchema),
  authController.changePassword
);

module.exports = router;
