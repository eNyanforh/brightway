import { z } from "zod";
import { countryCodes } from "../profile/profile.schema.js";

const name = z.string().trim().min(1).max(100);

export const registrationSchema = z.strictObject({
  photoAssetId: z.uuid(),
  firstName: name,

  middleName: name.optional(),

  lastName: name,

  gender: z.enum(["FEMALE", "MALE", "OTHER", "PREFER_NOT_TO_SAY"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "0001-01-01";
    }, "Enter a valid date of birth")
    .refine((value) => value <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future"),
  countryCode: z.string().trim().toUpperCase()
    .refine((value) => countryCodes.has(value), "Choose a valid country"),

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
