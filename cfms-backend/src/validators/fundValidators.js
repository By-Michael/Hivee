const { z } = require('zod');

const createFundSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    category: z.string().min(1).max(40).optional(),
    // Optional free-text reason/note for this fund — no length floor since
    // it's fine to leave blank, but capped so nobody pastes a novel in.
    description: z.string().max(1000).optional(),
  }),
});

const updateFundSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    category: z.string().min(1).max(40).optional(),
    description: z.string().max(1000).optional(),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createFundSchema, updateFundSchema, idParamSchema };
