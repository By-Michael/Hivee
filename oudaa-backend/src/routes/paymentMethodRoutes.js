const express = require('express');
const ctrl = require('../controllers/paymentMethodController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const {
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
  idParamSchema,
} = require('../validators/paymentMethodValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

// Residents need this list to choose which method to pay with (self-verify
// flow) — only ADMIN can create/edit/remove.
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listPaymentMethods);
router.post('/', authorize('ADMIN'), validate(createPaymentMethodSchema), ctrl.createPaymentMethod);
router.patch('/:id', authorize('ADMIN'), validate(updatePaymentMethodSchema), ctrl.updatePaymentMethod);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.deletePaymentMethod);

module.exports = router;
