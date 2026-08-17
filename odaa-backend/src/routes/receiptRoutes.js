const express = require('express');
const ctrl = require('../controllers/receiptController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');

const router = express.Router();

router.use(authenticate, tenantScope);

router.delete('/:id', authorize('ADMIN'), ctrl.deleteReceipt);

module.exports = router;
