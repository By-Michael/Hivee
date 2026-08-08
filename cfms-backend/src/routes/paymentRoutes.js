const express = require('express');
const ctrl = require('../controllers/paymentController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { screenshotUpload } = require('../config/upload');
const {
  createPaymentSchema,
  updatePaymentStatusSchema,
  idParamSchema,
  selfVerifyPaymentSchema,
} = require('../validators/paymentValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN', 'RESIDENT'), validate(createPaymentSchema), ctrl.createPayment);
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listPayments);

// Resident self-serve: submit a bank txn ID and get verified instantly.
router.post(
  '/self-verify',
  authorize('RESIDENT'),
  validate(selfVerifyPaymentSchema),
  ctrl.selfVerifyPayment
);
// Screenshot autofill: OCR the image, return best-guess name/txnId.
router.post(
  '/parse-screenshot',
  authorize('ADMIN', 'RESIDENT'),
  screenshotUpload.single('screenshot'),
  ctrl.parsePaymentScreenshot
);

router.get('/:id', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getPayment);
router.patch(
  '/:id/status',
  authorize('ADMIN'),
  validate(updatePaymentStatusSchema),
  ctrl.updatePaymentStatus
);

module.exports = router;
