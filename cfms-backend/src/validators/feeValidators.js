const { z } = require('zod');

const createFeeSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    amount: z.number().positive(),
    frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
    dueDay: z.number().int().min(1).max(31).optional(),
    description: z.string().optional(),
  }),
});

const updateFeeSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    amount: z.number().positive().optional(),
    frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
    dueDay: z.number().int().min(1).max(31).optional(),
    description: z.string().optional(),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createFeeSchema, updateFeeSchema, idParamSchema };
