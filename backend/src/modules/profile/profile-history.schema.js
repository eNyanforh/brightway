import { z } from "zod";
const month = z
  .string()
  .regex(
    /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/,
    "Use a valid month and year (YYYY-MM).",
  );
const text = (max) => z.string().trim().min(1).max(max);
export const experienceTypes = [
  "EMPLOYMENT",
  "INTERNSHIP",
  "VOLUNTEERING",
  "SELF_EMPLOYMENT",
];
export function historySchema(kind) {
  const record = z
    .strictObject({
      id: z.string().uuid().optional(),
      revision: z.number().int().min(1).max(2147483646).optional(),
      startMonth: month,
      endMonth: month.nullable(),
      current: z.boolean(),
      description: z.string().trim().max(1000),
      ...(kind === "education"
        ? { institution: text(160), qualification: text(160) }
        : {
            organization: text(160),
            role: text(160),
            type: z.enum(experienceTypes),
          }),
    })
    .superRefine((v, ctx) => {
      const issue = (field, message) =>
        ctx.addIssue({ code: "custom", path: [field], message });
      if (Boolean(v.id) !== Boolean(v.revision))
        issue("revision", "Existing records require their ID and revision.");
      if (v.current && v.endMonth !== null)
        issue("endMonth", "Current records must not have an end date.");
      if (!v.current && v.endMonth === null)
        issue("endMonth", "Choose an end month and year.");
      if (v.endMonth && v.endMonth < v.startMonth)
        issue("endMonth", "End date must not precede start date.");
      const now = new Date().toISOString().slice(0, 7);
      if (v.startMonth > now)
        issue("startMonth", "Start date must not be in the future.");
      if (v.endMonth && v.endMonth > now)
        issue("endMonth", "End date must not be in the future.");
    });
  return z
    .strictObject({
      expectedVersion: z.number().int().min(0).max(2147483646),
      mode: z.enum(["UNSET", "NONE", "RECORDS"]),
      records: z.array(record).max(20),
    })
    .superRefine((v, ctx) => {
      if ((v.mode === "RECORDS") !== v.records.length > 0)
        ctx.addIssue({
          code: "custom",
          path: ["records"],
          message:
            "Choose records with at least one entry, or a declaration without records.",
        });
      const ids = v.records.filter((r) => r.id).map((r) => r.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: ["records"],
          message: "Remove duplicate record IDs.",
        });
    });
}