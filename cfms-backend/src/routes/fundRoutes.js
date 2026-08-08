const express = require('express');
const ctrl = require('../controllers/fundController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { createFundSchema, updateFundSchema, idParamSchema } = require('../validators/fundValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN'), validate(createFundSchema), ctrl.createFund);
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listFunds);
// Must be registered before '/:id' so "summaries" isn't swallowed as an id param.
router.get('/summaries', authorize('ADMIN', 'RESIDENT'), ctrl.listFundSummaries);
router.get('/:id', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getFund);
router.get('/:id/summary', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getFundSummary);
router.patch('/:id', authorize('ADMIN'), validate(updateFundSchema), ctrl.updateFund);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.deleteFund);

module.exports = router;
