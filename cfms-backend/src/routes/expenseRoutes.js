const express = require('express');
const ctrl = require('../controllers/expenseController');
const receiptCtrl = require('../controllers/receiptController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { upload } = require('../config/upload');
const {
  createExpenseSchema,
  reverseExpenseSchema,
  idParamSchema,
} = require('../validators/expenseValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN'), validate(createExpenseSchema), ctrl.createExpense);
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listExpenses);
router.get('/:id', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getExpense);
// No general-purpose edit: corrections happen via reversal, which creates a
// new offsetting Expense rather than mutating the original.
router.post('/:id/reverse', authorize('ADMIN'), validate(reverseExpenseSchema), ctrl.reverseExpense);
// Narrow exception only — see DELETE_GRACE_WINDOW_MS in the controller.
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.deleteExpense);

router.get('/:expenseId/receipts', authorize('ADMIN', 'RESIDENT'), receiptCtrl.listReceiptsForExpense);
router.post(
  '/receipts',
  authorize('ADMIN'),
  upload.single('receipt'),
  receiptCtrl.uploadReceipt
);

module.exports = router;
