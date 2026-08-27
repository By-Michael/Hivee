const { z } = require('zod');

const PROVIDERS = ['CBE', 'TELEBIRR', 'DASHEN', 'ABYSSINIA', 'CBEBIRR', 'MPESA', 'BANK_OTHER'];

// Telebirr has no bank account — a committee registering one only needs a
// full name + phone number to give residents (see model comment in
// schema.prisma). Every other provider needs the usual bank triad.
const TELEBIRR_ONLY_FIELDS = new Set(['TELEBIRR']);

const baseFields = {
  provider: z.enum(PROVIDERS),
  label: z.string().trim().min(1).max(120),
  bankName: z.string().trim().max(120).optional(),
  accountName: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().max(60).optional(),
  fullName: z.string().trim().max(120).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
};

function refineByProvider(body) {
  if (TELEBIRR_ONLY_FIELDS.has(body.provider)) {
    return !!body.fullName && !!body.phoneNumber;
  }
  // CBE / DASHEN / ABYSSINIA / CBEBIRR / MPESA / BANK_OTHER — a bank
  // account to show residents in the "send payment to" block. CBE still
  // needs this even though residents no longer type a txn suffix for it
  // (see selfVerifyPayment's CBE branch) — the account is still shown so
  // they know where to send the money in the first place.
  return !!body.accountNumber;
}

const createPaymentMethodSchema = z.object({
  body: z.object(baseFields).refine(refineByProvider, {
    message: 'Telebirr needs a full name + phone number; other providers need an account number.',
    path: ['accountNumber'],
  }),
});

// Every field optional on update — but if provider is being changed (or
// was already set) the same per-provider requirement must still hold once
// merged with what's already stored. That merge happens in the
// controller (it has the existing row), so this schema only validates the
// shape of what was actually sent.
const updatePaymentMethodSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    provider: z.enum(PROVIDERS).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    bankName: z.string().trim().max(120).nullable().optional(),
    accountName: z.string().trim().max(120).nullable().optional(),
    accountNumber: z.string().trim().max(60).nullable().optional(),
    fullName: z.string().trim().max(120).nullable().optional(),
    phoneNumber: z.string().trim().max(20).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  }),
});

const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

module.exports = {
  PROVIDERS,
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
  idParamSchema,
};
