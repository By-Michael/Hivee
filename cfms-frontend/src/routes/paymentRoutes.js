const express = require('express');
const ctrl = require('../controllers/paymentController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const {
  createPaymentSchema,
  updatePaymentStatusSchema,
  idParamSchema,
} = require('../validators/paymentValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN', 'RESIDENT'), validate(createPaymentSchema), ctrl.createPayment);
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listPayments);
router.get('/:id', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getPayment);
router.patch(
  '/:id/status',
  authorize('ADMIN'),
  validate(updatePaymentStatusSchema),
  ctrl.updatePaymentStatus
);

module.exports = router;
