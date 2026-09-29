import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('must be a valid email address'));

// bcrypt only uses the first 72 bytes of a password, so longer ones are refused instead of silently cut.
const password = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(72, 'must be at most 72 characters');

// Bangladeshi mobile numbers: 01XXXXXXXXX, optionally with a +88 / 88 prefix. Stored as +8801XXXXXXXXX.
const phone = z
  .string()
  .trim()
  .regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'must be a Bangladeshi mobile number, e.g. 01712345678')
  .transform((value) => `+880${value.slice(-10)}`);

// strictObject rejects unknown fields: sending "role": "DRIVER" fails, so nobody can sign up as a driver.
export const RegisterBody = z.strictObject({
  fullName: z.string().trim().min(1, 'is required').max(80, 'must be at most 80 characters'),
  email,
  phone: phone.optional(),
  password,
});

export const LoginBody = z.strictObject({
  email,
  password: z.string().min(1, 'is required'),
});

export type RegisterInput = z.infer<typeof RegisterBody>;
export type LoginInput = z.infer<typeof LoginBody>;
