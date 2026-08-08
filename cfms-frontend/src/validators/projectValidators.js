const { z } = require('zod');

const createProjectSchema = z.object({
  body: z.object({
    fundId: z.string().uuid(),
    name: z.string().min(2),
    description: z.string().optional(),
    budget: z.number().positive(),
    status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
  }),
});

const updateProjectSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    budget: z.number().positive().optional(),
    status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createProjectSchema, updateProjectSchema, idParamSchema };
