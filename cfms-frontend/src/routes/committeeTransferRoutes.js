const express = require('express');
const ctrl = require('../controllers/committeeTransferController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const {
  createTransferSchema,
  decisionSchema,
  idParamSchema,
} = require('../validators/committeeTransferValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN'), validate(createTransferSchema), ctrl.createTransferRequest);
router.get('/mine', authorize('ADMIN', 'RESIDENT'), ctrl.listMyTransferItems);
router.patch('/:id/committee-response', authorize('ADMIN'), validate(decisionSchema), ctrl.respondAsCommittee);
router.patch('/:id/recipient-response', authorize('ADMIN', 'RESIDENT'), validate(decisionSchema), ctrl.respondAsRecipient);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.cancelTransferRequest);

module.exports = router;
