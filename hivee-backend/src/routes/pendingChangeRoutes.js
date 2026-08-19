const express = require('express');
const ctrl = require('../controllers/pendingChangeController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { decisionSchema, idParamSchema } = require('../validators/pendingChangeValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

// No generic POST / here on purpose — submitting a pending change is always
// initiated from the domain controller that owns the entity being changed
// (e.g. communityController.updateMyCommunity), which knows the correct
// changeType/entityId/proposed fields. This router only covers the shared
// review lifecycle (list/approve/reject/cancel).
router.get('/mine', authorize('ADMIN'), ctrl.listMyPendingChanges);
router.patch('/:id/respond', authorize('ADMIN'), validate(decisionSchema), ctrl.respondToPendingChange);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.cancelPendingChange);

module.exports = router;
