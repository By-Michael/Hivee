const { z } = require('zod');

const createTransferSchema = z.object({
  body: z.object({
    toResidentId: z.string().uuid(),
  }),
});

const decisionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createTransferSchema, decisionSchema, idParamSchema };
