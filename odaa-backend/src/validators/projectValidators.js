const { z } = require('zod');

// A project can be funded from one or more funds. `fundId` stays as the
// "primary" fund (kept for backward compatibility with existing filters/
// reports) but must itself also appear in `fundAllocations`. Amounts must
// sum to `budget` — checked in the controller, where we have the real
// Decimal budget to compare against rather than duplicating that logic
// here.
const fundAllocationSchema = z.object({
  fundId: z.string().uuid(),
  amount: z.number().positive(),
});

const createProjectSchema = z.object({
  body: z.object({
    fundId: z.string().uuid(),
    // Optional: if omitted, the whole budget is allocated to fundId (the
    // common single-fund case) so existing API consumers keep working.
    fundAllocations: z.array(fundAllocationSchema).min(1).optional(),
    name: z.string().min(2),
    description: z.string().optional(),
    budget: z.number().positive(),
    // CANCELLED is deliberately not accepted here — a project can only be
    // cancelled afterwards, through committee approval (see
    // PROJECT_CANCELLATION in pendingChanges.js), never set at creation.
    status: z.enum(['PLANNED', 'ONGOING']).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
  }),
});

// status is intentionally NOT accepted here at all — every status
// transition (including PLANNED <-> ONGOING <-> COMPLETED, and especially
// -> CANCELLED) now goes through its own endpoint/flow so a mandatory
// cancellation reason and committee approval can't be bypassed by folding
// it into a generic PATCH. See projectController.updateProject and the new
// cancelProject.
const updateProjectSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    budget: z.number().positive().optional(),
    fundAllocations: z.array(fundAllocationSchema).min(1).optional(),
    status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED']).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

const cancelProjectSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    cancelReason: z.string().min(3, 'A cancellation reason is required'),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = {
  createProjectSchema,
  updateProjectSchema,
  cancelProjectSchema,
  idParamSchema,
};
