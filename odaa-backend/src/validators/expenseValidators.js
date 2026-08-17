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

// Expenses have no direct-update endpoint — corrections go through
// reverseExpense instead (see expenseController.js). `reason` is optional
// but strongly encouraged; it's stored on the reversal's description and in
// the audit log.
const reverseExpenseSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    reason: z.string().min(1).optional(),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createExpenseSchema, reverseExpenseSchema, idParamSchema };
