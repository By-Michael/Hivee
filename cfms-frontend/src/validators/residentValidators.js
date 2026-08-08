const { z } = require('zod');

const createResidentSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    unitNumber: z.string().min(1),
    status: z.enum(['ACTIVE', 'INACTIVE', 'MOVED_OUT']).optional(),
    phone: z.string().min(3).optional(),
    idNumber: z.string().min(1).optional(),
    address: z.string().optional(),
    ownerType: z.enum(['OWNER', 'RENTER']).optional(),
  }),
});

const updateResidentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    fullName: z.string().min(2).optional(),
    email: z.string().email().optional(),
    unitNumber: z.string().min(1).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'MOVED_OUT']).optional(),
    phone: z.string().min(3).optional(),
    idNumber: z.string().min(1).optional(),
    address: z.string().optional(),
    ownerType: z.enum(['OWNER', 'RENTER']).optional(),
  }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

module.exports = { createResidentSchema, updateResidentSchema, idParamSchema };
