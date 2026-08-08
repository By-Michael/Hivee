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
  updateExpenseSchema,
  idParamSchema,
} = require('../validators/expenseValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN'), validate(createExpenseSchema), ctrl.createExpense);
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listExpenses);
router.get('/:id', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getExpense);
router.patch('/:id', authorize('ADMIN'), validate(updateExpenseSchema), ctrl.updateExpense);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.deleteExpense);

router.get('/:expenseId/receipts', authorize('ADMIN', 'RESIDENT'), receiptCtrl.listReceiptsForExpense);
router.post(
  '/receipts',
  authorize('ADMIN'),
  upload.single('receipt'),
  receiptCtrl.uploadReceipt
);

module.exports = router;
