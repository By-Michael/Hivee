const express = require('express');
const ctrl = require('../controllers/paymentController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { screenshotUpload, upload } = require('../config/upload');
const {
  createPaymentSchema,
  updatePaymentSchema,
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
// Edit/delete: ADMIN only, and further restricted inside the controller to
// payments that were recorded manually (recordedBy set) — see comments
// there for why self-verified bank payments stay append-only.
router.patch(
  '/:id',
  authorize('ADMIN'),
  validate(updatePaymentSchema),
  ctrl.updatePayment
);
router.delete(
  '/:id',
  authorize('ADMIN'),
  validate(idParamSchema),
  ctrl.deletePayment
);
// Optional receipt photo/PDF for a manually-recorded (cash/in-person) payment.
router.post(
  '/:id/receipt',
  authorize('ADMIN'),
  validate(idParamSchema),
  upload.single('receipt'),
  ctrl.uploadPaymentReceipt
);

module.exports = router;
