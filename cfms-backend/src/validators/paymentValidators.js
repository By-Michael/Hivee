const { z } = require('zod');

// A payment is for exactly one of a fee or a project — never both, never
// neither. Encoded as a .refine() here since Prisma/Postgres can't express
// an XOR constraint across two nullable FK columns.
const oneTarget = (body) => (!!body.feeId) !== (!!body.projectId); // exactly one truthy
const oneTargetMessage = { message: 'Provide exactly one of feeId or projectId', path: ['feeId'] };

const createPaymentSchema = z.object({
  body: z.object({
    residentId: z.string().uuid().optional(), // ADMIN may record on behalf of a resident
    feeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    amount: z.number().positive(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER']).optional(),
    transactionReference: z.string().optional(),
    paidAt: z.coerce.date().optional(),
  }).refine(oneTarget, oneTargetMessage),
});

// ADMIN editing a payment they (or a fellow committee member) recorded
// manually. Every field optional — only what changed needs to be sent —
// but feeId/projectId must still resolve to exactly one target if either
// is touched.
const updatePaymentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    feeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    amount: z.number().positive().optional(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER']).optional(),
    transactionReference: z.string().optional(),
    paidAt: z.coerce.date().optional(),
  }).refine((body) => {
    if (!body.feeId && !body.projectId) return true; // neither touched — fine
    return oneTarget(body);
  }, oneTargetMessage),
});

const updatePaymentStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

const selfVerifyPaymentSchema = z.object({
  body: z.object({
    feeId: z.string().uuid(),
    txnId: z.string().min(1),
    payerName: z.string().min(1),
    reason: z.string().optional(),
    // Optional — lets a resident contribute more than the fee's usual
    // amount (e.g. "top up" a fund). Must be >= the fee amount; enforced
    // in the controller where the fee itself is loaded.
    amount: z.number().positive().optional(),
  }),
});

module.exports = {
  createPaymentSchema,
  updatePaymentSchema,
  updatePaymentStatusSchema,
  idParamSchema,
  selfVerifyPaymentSchema,
};
