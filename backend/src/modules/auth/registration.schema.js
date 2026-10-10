import { z } from "zod";

const name = z.string().trim().min(1).max(100);

export const registrationSchema = z.strictObject({
  firstName: name,

  middleName: name.optional(),

  lastName: name,

  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(
      /^[a-z0-9_]+$/,
      "Use only letters, numbers, and underscores"
    ),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email()),

  // Preserve password whitespace and case.
  password: z.string().min(15).max(128),
});