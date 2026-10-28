import { z } from "zod";
import { createHash } from "node:crypto";
import { countryCodes } from "../profile/profile.schema.js";
const text = max => z.string().trim().min(1).max(max).refine(s => !/[\u0000-\u001f\u007f]/.test(s));
const requestFields = {
  idempotencyKey: z.uuid(), name: text(160).min(2), type: z.enum(["SCHOOL", "NGO", "COMPANY"]), representativeRole: text(120).min(2),
  countryCode: text(2).transform(s => s.toUpperCase()).refine(s => countryCodes.has(s)),
  region: z.string().trim().max(120).refine(s => !/[\u0000-\u001f\u007f]/.test(s)), city: text(120), address: text(300), offersTraining: z.boolean().optional(),
};
function requestRules(v, ctx) {
  if (v.type !== "SCHOOL" && v.offersTraining === undefined) ctx.addIssue({ code: "custom", message: "Answer the training question.", path: ["offersTraining"] });
  if (v.type === "SCHOOL" && v.offersTraining !== undefined) ctx.addIssue({ code: "custom", message: "School capability is set by the server.", path: ["offersTraining"] });
}
const normalizeRequest = v => ({ ...v, offersTraining: v.type === "SCHOOL" ? true : v.offersTraining });
export const organizationRequestSchema = z.strictObject(requestFields).superRefine(requestRules).transform(normalizeRequest);
export const versionSchema = z.number().int().min(1).max(2147483646);
const { idempotencyKey: unusedKey, ...editableFields } = requestFields;
void unusedKey;
export const editOrganizationSchema = z.strictObject({ ...editableFields, expectedVersion: versionSchema }).superRefine(requestRules).transform(normalizeRequest);
export const abortOrganizationSchema = z.strictObject({ expectedVersion: versionSchema });
export const assignOrganizationSchema = z.strictObject({ expectedVersion: versionSchema, agentUsername: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/) });
export const organizationFindingSchema = z.strictObject({ expectedVersion: versionSchema,
  existenceConfirmed: z.boolean(), locationConfirmed: z.boolean(), authorityConfirmed: z.boolean(), typeConfirmed: z.boolean(), operationalConfirmed: z.boolean(),
  recommendation: z.enum(["APPROVE", "REJECT"]), notes: z.string().trim().min(10).max(4000), setupAssistance: z.string().trim().max(2000),
}).superRefine((v, ctx) => { if (v.recommendation === "APPROVE" && !allChecks(v)) ctx.addIssue({ code: "custom", message: "All checks must be confirmed before recommending approval." }); });
export const organizationDecisionSchema = z.strictObject({ expectedVersion: versionSchema, decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().min(10).max(2000) });
export function allChecks(v) { return ["existenceConfirmed", "locationConfirmed", "authorityConfirmed", "typeConfirmed", "operationalConfirmed"].every(k => v[k] === true); }
export const digest = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const failure = (status, message) => Object.assign(Error(message), { status });
export function parse(schema, body) { const r = schema.safeParse(body); if (!r.success) throw failure(400, "Check the organization fields. Unknown fields and incomplete inputs are not accepted."); return r.data; }
export function requestId(value) { if (!z.uuid().safeParse(value).success) throw failure(404, "Organization request not found."); return value; }
