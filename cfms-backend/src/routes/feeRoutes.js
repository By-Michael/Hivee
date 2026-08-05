const express = require('express');
const ctrl = require('../controllers/feeController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { createFeeSchema, updateFeeSchema, idParamSchema } = require('../validators/feeValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN'), validate(createFeeSchema), ctrl.createFee);
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listFees);
router.get('/:id', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getFee);
router.patch('/:id', authorize('ADMIN'), validate(updateFeeSchema), ctrl.updateFee);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.deleteFee);

module.exports = router;
