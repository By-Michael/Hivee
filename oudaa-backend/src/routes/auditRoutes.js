const express = require('express');
const ctrl = require('../controllers/auditController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');

const router = express.Router();

router.use(authenticate, tenantScope);

// Read-only by design: every committee member can view, nobody can edit
// or delete an entry. No PATCH/PUT/DELETE routes exist here on purpose.
router.get('/', authorize('ADMIN'), ctrl.listAuditLogs);

module.exports = router;
