const { z } = require('zod');

const createPaymentSchema = z.object({
  body: z.object({
    residentId: z.string().uuid().optional(), // ADMIN may record on behalf of a resident
    feeId: z.string().uuid(),
    amount: z.number().positive(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER']).optional(),
    transactionReference: z.string().optional(),
    paidAt: z.coerce.date().optional(),
  }),
});

const updatePaymentStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createPaymentSchema, updatePaymentStatusSchema, idParamSchema };
