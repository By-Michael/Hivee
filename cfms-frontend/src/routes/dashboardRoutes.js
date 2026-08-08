const express = require('express');
const ctrl = require('../controllers/dashboardController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');

const router = express.Router();

router.use(authenticate, tenantScope);

router.get('/admin', authorize('ADMIN'), ctrl.getAdminDashboard);
router.get('/resident', authorize('RESIDENT'), ctrl.getResidentDashboard);

module.exports = router;
