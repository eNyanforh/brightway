import { z } from "zod";

const name = z.string().trim().min(1).max(100);

// Reject unexpected fields: a client cannot assign status or organization roles.
export const registrationSchema = z.strictObject({
  firstName: name,
  middleName: name.optional(),
  lastName: name,
  username: z.string().trim().toLowerCase().min(3).max(30)
    .regex(/^[a-z0-9_]+$/, "Use only letters, numbers, and underscores"),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  // Preserve password whitespace and case. No silent truncation or trimming.
  password: z.string().min(15).max(128),
});
