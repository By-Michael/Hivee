const express = require('express');
const ctrl = require('../controllers/committeeAutoApprovalController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { upsertAutoApprovalSchema } = require('../validators/committeeAutoApprovalValidators');

const router = express.Router();

router.use(authenticate, tenantScope, authorize('ADMIN'));

router.get('/', ctrl.listAutoApprovals);
router.put('/', validate(upsertAutoApprovalSchema), ctrl.upsertAutoApproval);

module.exports = router;
