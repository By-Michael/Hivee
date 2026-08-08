const express = require('express');
const ctrl = require('../controllers/communityController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate);

// Platform-level: SUPER_ADMIN only.
router.get('/', authorize('SUPER_ADMIN'), ctrl.listCommunities);
router.get('/:id', authorize('SUPER_ADMIN'), ctrl.getCommunity);

// Tenant self-service: the community's own ADMIN.
router.get('/me/current', authorize('ADMIN'), ctrl.getMyCommunity);
router.patch('/me/current', authorize('ADMIN'), ctrl.updateMyCommunity);

module.exports = router;
