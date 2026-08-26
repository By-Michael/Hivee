const express = require('express');
const ctrl = require('../controllers/reportController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');

const router = express.Router();

router.use(authenticate, tenantScope);

// Reports are financial oversight documents — ADMIN only.
router.get('/collections', authorize('ADMIN'), ctrl.collectionsReport);
router.get('/expenses', authorize('ADMIN'), ctrl.expenseReport);
router.get('/summary', authorize('ADMIN'), ctrl.financialSummaryReport);
// Aggregated stats for the Dashboard/Reports pages (totals, by-fee,
// by-category, monthly trend) — computed as DB aggregates/group-bys
// instead of the client downloading every payment/expense row.
router.get('/dashboard-summary', authorize('ADMIN'), ctrl.reportsSummary);

module.exports = router;
