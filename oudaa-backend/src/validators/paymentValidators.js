const { z } = require('zod');

// A payment is for exactly one of a fee, a project, or a fund directly —
// never zero, never more than one. Encoded as a .refine() here since
// Prisma/Postgres can't express an XOR constraint across three nullable FK
// columns.
const oneTarget = (body) => [!!body.feeId, !!body.projectId, !!body.fundId].filter(Boolean).length === 1;
const oneTargetMessage = { message: 'Provide exactly one of feeId, projectId, or fundId', path: ['feeId'] };

const createPaymentSchema = z.object({
  body: z.object({
    residentId: z.string().uuid().optional(), // ADMIN may record on behalf of a resident
    feeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    fundId: z.string().uuid().optional(),
    amount: z.number().positive(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER']).optional(),
    transactionReference: z.string().optional(),
    paidAt: z.coerce.date().optional(),
  }).refine(oneTarget, oneTargetMessage),
});

// ADMIN editing a payment they (or a fellow committee member) recorded
// manually. Every field optional — only what changed needs to be sent —
// but feeId/projectId/fundId must still resolve to exactly one target if
// any of the three is touched.
const updatePaymentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    feeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    fundId: z.string().uuid().optional(),
    amount: z.number().positive().optional(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER']).optional(),
    transactionReference: z.string().optional(),
    paidAt: z.coerce.date().optional(),
  }).refine((body) => {
    if (!body.feeId && !body.projectId && !body.fundId) return true; // none touched — fine
    return oneTarget(body);
  }, oneTargetMessage),
});

const updatePaymentStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['PENDING', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED']),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

const selfVerifyPaymentSchema = z.object({
  body: z.object({
    // Exactly one of feeId or fundId — feeId for "pay a fee", fundId for a
    // free-standing "contribute whatever amount to this fund" payment
    // (Community Funds page). Enforced by the .refine() below.
    feeId: z.string().uuid().optional(),
    fundId: z.string().uuid().optional(),
    txnId: z.string().min(1),
    payerName: z.string().min(1),
    reason: z.string().optional(),
    // Optional for feeId (defaults to the fee's amount, must be >= it —
    // enforced in the controller). Required for fundId — a direct fund
    // contribution has no "usual amount" to fall back to.
    amount: z.number().positive().optional(),
    // Which bank/provider the receipt is from — lets Veritas skip
    // auto-detection and lets us know which secondary field to require.
    provider: z.enum(['cbe', 'telebirr', 'dashen', 'abyssinia', 'cbebirr', 'mpesa']).optional(),
    // Required by CBE (legacy FT refs) and Bank of Abyssinia.
    suffix: z.string().optional(),
    // Required by CBE Birr, format 251XXXXXXXXX.
    phoneNumber: z.string().optional(),
    // Best-effort amount OCR'd off the receipt screenshot the resident
    // uploaded (see parsePaymentScreenshot). Purely a client-side signal —
    // never trusted as proof by itself — but if it disagrees with the
    // amount the resident actually typed/submitted, that's worth flagging
    // for admin review rather than silently ignoring (see selfVerifyPayment).
    // The frontend always sends this key (initialized as useState(null)),
    // sending an explicit `null` whenever OCR/Groq extraction didn't find
    // an amount — which is a valid, expected outcome (blurry receipt,
    // regex-only fallback, Groq unreachable), not a validation error.
    // z.optional() alone only tolerates a missing key, not an explicit
    // null, so without .nullable() every submission where extraction came
    // up empty was rejected outright with "expected number, received
    // null". .nullable() accepts null and we normalize it to undefined so
    // downstream code (controller's `!== undefined && !== null` check)
    // doesn't need to change.
    receiptAmount: z.number().positive().nullable().optional().transform((v) => v ?? undefined),
  }).refine((body) => [!!body.feeId, !!body.fundId].filter(Boolean).length === 1, {
    message: 'Provide exactly one of feeId or fundId',
    path: ['feeId'],
  }).refine((body) => !body.fundId || body.amount !== undefined, {
    message: 'amount is required when contributing directly to a fund',
    path: ['amount'],
  }),
});

// Batch-verify is filter-driven, not id-list-driven — see
// paymentController.batchVerifyPayments for why. Every field is optional
// (an empty body just means "any pending/needs-review payment"); the
// controller caps how many actually get processed in one run regardless
// of how many match.
const batchVerifyPaymentsSchema = z.object({
  body: z.object({
    residentQuery: z.string().trim().min(1).optional(),
    feeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    fundId: z.string().uuid().optional(),
    status: z.enum(['pending', 'pending_review', 'any']).optional(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER']).optional(),
    minAmount: z.number().nonnegative().optional(),
    maxAmount: z.number().nonnegative().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  }).refine((body) => [!!body.feeId, !!body.projectId, !!body.fundId].filter(Boolean).length <= 1, {
    message: 'Filter by at most one of feeId, projectId, or fundId',
    path: ['feeId'],
  }).refine((body) => body.minAmount === undefined || body.maxAmount === undefined || body.minAmount <= body.maxAmount, {
    message: 'minAmount must not be greater than maxAmount',
    path: ['minAmount'],
  }).refine((body) => !body.dateFrom || !body.dateTo || body.dateFrom <= body.dateTo, {
    message: 'dateFrom must not be after dateTo',
    path: ['dateFrom'],
  }),
});

module.exports = {
  createPaymentSchema,
  updatePaymentSchema,
  updatePaymentStatusSchema,
  idParamSchema,
  selfVerifyPaymentSchema,
  batchVerifyPaymentsSchema,
};
