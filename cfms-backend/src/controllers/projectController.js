const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');
const { createPendingChange } = require('./pendingChangeController');

const createProject = catchAsync(async (req, res) => {
  const fund = await prisma.fund.findFirst({
    where: { id: req.body.fundId, communityId: req.communityId },
  });
  if (!fund) throw new AppError('Fund not found in this community', 404);

  const project = await prisma.project.create({
    data: { ...req.body, communityId: req.communityId },
  });
  await recordAudit(req, { action: 'CREATE', entityType: 'Project', entityId: project.id, description: `Created project "${project.name}"` });
  res.status(201).json({ success: true, data: project });
});

const listProjects = catchAsync(async (req, res) => {
  const projects = await prisma.project.findMany({
    where: { communityId: req.communityId },
    include: { fund: { select: { id: true, name: true } }, _count: { select: { expenses: true } } },
    orderBy: { startDate: 'desc' },
  });
  res.json({ success: true, data: projects });
});

const getProject = catchAsync(async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { fund: true, expenses: true },
  });
  if (!project) throw new AppError('Project not found', 404);
  res.json({ success: true, data: project });
});

// Non-financial fields (name/description/dates/status) can be edited
// directly by any community admin — they don't affect the financial trail.
// `budget` is different: once a project has any expenses logged against
// it, budget is load-bearing for the ledger (computeFundMoney's
// totalAllocated/remaining in fundController.js), so a change in either
// direction is routed through the committee PendingChange approval flow
// instead of applying instantly — a lone admin can't quietly inflate a
// budget to hide overspending or shrink it to make a project look
// abandoned. Before any expenses exist there's no history to protect, so
// budget edits on a brand-new project apply immediately like everything
// else.
const updateProject = catchAsync(async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { _count: { select: { expenses: true } } },
  });
  if (!project) throw new AppError('Project not found', 404);

  const { budget, ...rest } = req.body;
  const instantData = {};
  if (rest.name !== undefined) instantData.name = rest.name;
  if (rest.description !== undefined) instantData.description = rest.description;
  if (rest.status !== undefined) instantData.status = rest.status;
  if (rest.startDate !== undefined) instantData.startDate = rest.startDate;
  if (rest.endDate !== undefined) instantData.endDate = rest.endDate;

  let pendingChangeResult = null;
  if (budget !== undefined) {
    if (project._count.expenses > 0) {
      pendingChangeResult = await createPendingChange(req, {
        changeType: 'PROJECT_BUDGET',
        entityId: project.id,
        currentEntity: project,
        proposedFields: { budget },
      });
    } else {
      instantData.budget = budget;
    }
  }

  const updated = Object.keys(instantData).length > 0
    ? await prisma.project.update({ where: { id: project.id }, data: instantData })
    : project;

  if (Object.keys(instantData).length > 0) {
    await recordAudit(req, {
      action: 'UPDATE',
      entityType: 'Project',
      entityId: project.id,
      description: `Updated project "${updated.name}"${instantData.budget !== undefined ? ` (budget: ${project.budget} -> ${instantData.budget}, no expenses logged yet so applied immediately)` : ''}`,
      metadata: { before: { name: project.name, description: project.description, status: project.status, startDate: project.startDate, endDate: project.endDate, budget: Number(project.budget) }, after: instantData },
    });
  }

  res.json({
    success: true,
    data: { ...updated, ...(pendingChangeResult?.applied ? pendingChangeResult.entity : {}) },
    pendingChange: pendingChangeResult?.pending || null,
    budgetChangeMessage: budget !== undefined && project._count.expenses > 0
      ? (pendingChangeResult?.pending
          ? 'Budget change needs every other committee member to approve before it takes effect.'
          : pendingChangeResult?.applied
            ? 'Budget updated — you\'re the only committee member, so no separate approval was needed.'
            : 'No budget change to apply.')
      : undefined,
  });
});

// Deletion is blocked once a project has any expenses logged against it —
// deleting the project would orphan (or cascade-delete, depending on the
// relation) the very expense trail this whole feature exists to protect.
// An empty, never-used project can still be removed outright since there's
// no financial history at stake yet.
const deleteProject = catchAsync(async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
    include: { _count: { select: { expenses: true } } },
  });
  if (!project) throw new AppError('Project not found', 404);
  if (project._count.expenses > 0) {
    throw new AppError('This project has expenses logged against it and can no longer be deleted. Mark it CANCELLED or COMPLETED instead.', 403);
  }

  await prisma.project.delete({ where: { id: project.id } });
  await recordAudit(req, { action: 'DELETE', entityType: 'Project', entityId: project.id, description: `Deleted project "${project.name}" (no expenses had been logged against it)` });
  res.json({ success: true, message: 'Project deleted' });
});

module.exports = { createProject, listProjects, getProject, updateProject, deleteProject };
