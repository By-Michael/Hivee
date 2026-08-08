const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../utils/audit');

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

const updateProject = catchAsync(async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!project) throw new AppError('Project not found', 404);

  const updated = await prisma.project.update({ where: { id: project.id }, data: req.body });
  await recordAudit(req, { action: 'UPDATE', entityType: 'Project', entityId: project.id, description: `Updated project "${updated.name}"` });
  res.json({ success: true, data: updated });
});

const deleteProject = catchAsync(async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, communityId: req.communityId },
  });
  if (!project) throw new AppError('Project not found', 404);

  await prisma.project.delete({ where: { id: project.id } });
  await recordAudit(req, { action: 'DELETE', entityType: 'Project', entityId: project.id, description: `Deleted project "${project.name}"` });
  res.json({ success: true, message: 'Project deleted' });
});

module.exports = { createProject, listProjects, getProject, updateProject, deleteProject };
