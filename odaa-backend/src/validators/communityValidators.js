const { z } = require('zod');

// PATCH /community/me/current had no validator at all — raw req.body went
// straight into Prisma. That's how the missing-migration bug on
// autoVerifyMaxAmount surfaced as an opaque 400 instead of a clean 422, and
// it also meant nothing stopped e.g. a negative or non-numeric threshold
// from being sent. Mirrors the instant-apply / committee-approval field
// split documented in communityController.js.
const updateCommunitySchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    address: z.string().optional(),
    contactInfo: z.string().optional(),
    paymentBankName: z.string().min(1).optional(),
    paymentAccountName: z.string().min(1).optional(),
    paymentAccountNumber: z.string().min(1).optional(),
    // Blank field on the Settings form is sent as null to clear the
    // threshold; anything else must be a non-negative number.
    autoVerifyMaxAmount: z.number().nonnegative().nullable().optional(),
  }),
});

module.exports = { updateCommunitySchema };
