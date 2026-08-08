const { z } = require('zod');

const CATEGORY = ['SECURITY', 'WATER', 'CLEANING', 'MAINTENANCE', 'IMPROVEMENT', 'ADMIN', 'OTHER'];

const createExpenseSchema = z.object({
  body: z.object({
    projectId: z.string().uuid().optional(),
    category: z.enum(CATEGORY).optional(),
    description: z.string().optional(),
    vendor: z.string().optional(),
    amount: z.number().positive(),
    spentAt: z.coerce.date().optional(),
    bankName: z.string().optional(),
    transactionReference: z.string().optional(),
  }),
});

const updateExpenseSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    category: z.enum(CATEGORY).optional(),
    description: z.string().optional(),
    vendor: z.string().optional(),
    amount: z.number().positive().optional(),
    spentAt: z.coerce.date().optional(),
    bankName: z.string().optional(),
    transactionReference: z.string().optional(),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createExpenseSchema, updateExpenseSchema, idParamSchema };
