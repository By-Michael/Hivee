const { z } = require('zod');

const chatMessageSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(2000),
    // Prior turns from the client's own in-memory conversation (not yet
    // persisted) — lets the model see context even before the user opts
    // in to saving. Capped server-side regardless of what's sent here.
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().min(1).max(4000),
        })
      )
      .max(40)
      .optional(),
    // If set, append this turn to an existing saved session instead of
    // just answering statelessly.
    sessionId: z.string().min(1).optional(),
  }),
});

const saveSessionSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(120).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().min(1).max(4000),
        })
      )
      .min(1)
      .max(200),
  }),
});

module.exports = { chatMessageSchema, saveSessionSchema };
