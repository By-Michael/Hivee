const express = require('express');
const ctrl = require('../controllers/projectController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const {
  createProjectSchema,
  updateProjectSchema,
  idParamSchema,
} = require('../validators/projectValidators');

const router = express.Router();

router.use(authenticate, tenantScope);

router.post('/', authorize('ADMIN'), validate(createProjectSchema), ctrl.createProject);
router.get('/', authorize('ADMIN', 'RESIDENT'), ctrl.listProjects);
router.get('/:id', authorize('ADMIN', 'RESIDENT'), validate(idParamSchema), ctrl.getProject);
router.patch('/:id', authorize('ADMIN'), validate(updateProjectSchema), ctrl.updateProject);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema), ctrl.deleteProject);

module.exports = router;
