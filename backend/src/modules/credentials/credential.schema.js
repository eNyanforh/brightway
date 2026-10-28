import { z } from "zod";
export const kindSchema = z.enum(["education", "experience"]);
const version = z.number().int().min(0).max(2147483646);
export const submitSchema = z.strictObject({
  expectedVersion: version,
  revision: version.refine((v) => v > 0),
  issuerOrganizationId: z.uuid().nullable().default(null),
  evidenceIds: z.array(z.uuid()).min(1).max(3).refine((v) => new Set(v).size === v.length),
});
export const assignSchema = z.strictObject({ expectedVersion: version });
export const decisionSchema = z.strictObject({
  expectedVersion: version,
  revision: version.refine((v) => v > 0),
  status: z.enum(["VERIFIED", "ACTION_REQUIRED", "UNABLE_TO_VERIFY", "FALSE_CREDENTIAL"]),
  note: z.string().trim().min(10).max(2000),
});
