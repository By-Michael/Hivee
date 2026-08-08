const { z } = require('zod');

const registerCommunitySchema = z.object({
  body: z.object({
    community: z.object({
      name: z.string().min(2),
      address: z.string().optional(),
      contactInfo: z.string().optional(),
    }),
    admin: z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
    }),
  }),
});

const registerResidentSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    unitNumber: z.string().min(1),
  }),
});

const loginSchema = z.object({
  body: z.object({
    // Accepts either an email address or a phone number in the same field.
    identifier: z.string().min(3),
    password: z.string().min(1),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10).optional(),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }),
});

module.exports = {
  registerCommunitySchema,
  registerResidentSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
};
