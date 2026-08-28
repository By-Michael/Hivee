const { z } = require('zod');

const CATEGORY = ['SECURITY', 'WATER', 'CLEANING', 'MAINTENANCE', 'IMPROVEMENT', 'ADMIN', 'OTHER'];

// An expense targets at most one of projectId / fundId — never both. Both
// may be omitted for a general community expense (checked only against the
// community's overall balance). When fundId IS set (a committee member
// spending straight out of a fund, with no project/budget line behind it),
// `reason` is mandatory — it's the only justification on record for that
// spend.
const atMostOneTarget = (body) => !(body.projectId && body.fundId);
const atMostOneTargetMessage = { message: 'An expense can be linked to a project or a fund, not both', path: ['fundId'] };
const reasonRequiredForFund = (body) => !body.fundId || (typeof body.reason === 'string' && body.reason.trim().length > 0);
const reasonRequiredMessage = { message: 'A reason is required when deducting directly from a fund', path: ['reason'] };

const createExpenseSchema = z.object({
  body: z.object({
    projectId: z.string().uuid().optional(),
    fundId: z.string().uuid().optional(),
    reason: z.string().optional(),
    category: z.enum(CATEGORY).optional(),
    description: z.string().optional(),
    vendor: z.string().optional(),
    amount: z.number().positive(),
    spentAt: z.coerce.date().optional(),
    bankName: z.string().optional(),
    transactionReference: z.string().optional(),
  }).refine(atMostOneTarget, atMostOneTargetMessage)
    .refine(reasonRequiredForFund, reasonRequiredMessage),
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
