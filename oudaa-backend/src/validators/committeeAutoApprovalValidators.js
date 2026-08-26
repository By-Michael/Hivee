const { z } = require('zod');

const upsertAutoApprovalSchema = z.object({
  body: z.object({
    changeType: z.string().min(1),
    enabled: z.boolean(),
    // Only required/validated when enabled=true (controller enforces the
    // range) — kept optional here so disabling doesn't need to send it.
    expiresInDays: z.number().int().optional(),
    // Must be explicitly true to enable; the frontend confirmation dialog
    // sets this once the person clicks through the accountability notice.
    acknowledged: z.boolean().optional(),
    // Which other committee members' proposals this covers. Omitted or []
    // means "anyone" (the original blanket behavior). Only meaningful when
    // enabled=true — the controller ignores it when disabling.
    scopedToUserIds: z.array(z.string().min(1)).optional(),
  }),
});

module.exports = { upsertAutoApprovalSchema };
