const { z } = require('zod');

// A recurring fee (anything but ONE_TIME) needs a day-of-month the
// committee wants it to recur on, so the "due" date is unambiguous for
// every billing cycle. ONE_TIME fees have no recurrence, so dueDay is
// meaningless for them and stays optional.
function requireDueDayUnlessOneTime(data, ctx) {
  const frequency = data.frequency || 'MONTHLY';
  if (frequency !== 'ONE_TIME' && (data.dueDay === undefined || data.dueDay === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dueDay'],
      message: 'Pick which day of the month this fee should recur on',
    });
  }
}

const createFeeSchema = z.object({
  body: z
    .object({
      name: z.string().min(2),
      amount: z.number().positive(),
      frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
      dueDay: z.number().int().min(1).max(31).optional(),
      description: z.string().optional(),
    })
    .superRefine(requireDueDayUnlessOneTime),
});

const updateFeeSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      amount: z.number().positive().optional(),
      frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
      dueDay: z.number().int().min(1).max(31).optional(),
      description: z.string().optional(),
    })
    // Only enforce on update when frequency is actually being set/changed
    // in this request — a PATCH that only touches `amount` shouldn't
    // suddenly require dueDay to be resent too.
    .superRefine((data, ctx) => {
      if (data.frequency !== undefined) requireDueDayUnlessOneTime(data, ctx);
    }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = { createFeeSchema, updateFeeSchema, idParamSchema };
