import { z } from "zod";

export const loginSchema = z.strictObject({
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(254),

  password: z
    .string()
    .min(1)
    .max(128),
});