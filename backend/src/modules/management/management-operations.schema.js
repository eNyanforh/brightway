import { z } from "zod";
export const operationError = (status, message) => Object.assign(Error(message), { status });
export function parse(schema, input) { const r = schema.safeParse(input); if (!r.success) throw operationError(400, "Provide valid management fields only. Check the required values."); return r.data; }
export const uuid = z.uuid();
export const reason = z.string().trim().min(10).max(1000);
export const pageSchema = z.strictObject({ q: z.string().trim().max(100).default(""), cursor: uuid.optional(), status: z.string().max(30).optional() });
export const auditQuerySchema = pageSchema.omit({ cursor:true }).extend({ cursor:z.string().max(300).optional() });
export const auditCursorSchema = z.strictObject({ at:z.iso.datetime(), id:uuid, source:z.enum(["OPERATIONS","STAFF","CREDENTIAL","IDENTITY","ORGANIZATION","PHOTO","NAME"]) });
export const actionSchema = z.strictObject({ expectedVersion: z.int().nonnegative(), action: z.enum(["SUSPEND", "RESTORE", "SIGN_OUT"]), reason, requestKey: uuid });
export const caseQuerySchema = z.strictObject({ kind: z.enum(["SUPPORT", "REPORT"]), status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "DISMISSED"]).optional(), q: z.string().trim().max(100).default(""), cursor: uuid.optional() });
export const caseCreateSchema = z.strictObject({ kind: z.enum(["SUPPORT", "REPORT"]), subject: z.string().trim().min(5).max(160), body: z.string().trim().min(10).max(4000), targetType: z.enum(["ACCOUNT", "ORGANIZATION"]).optional(), targetId: uuid.optional(), targetUsername: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/).optional(), requestKey: uuid }).superRefine((v, ctx) => {
  if (!!v.targetType !== !!(v.targetId || v.targetUsername) || v.targetId && v.targetUsername || v.kind === "REPORT" && !v.targetType) ctx.addIssue({ code: "custom", message: "A report requires a target." });
});
export const caseActionSchema = z.strictObject({ expectedVersion: z.int().positive(), action: z.enum(["ASSIGN_SELF", "RELEASE", "STATUS", "PRIORITY"]), status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "DISMISSED"]).optional(), priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(), reason, requestKey: uuid }).superRefine((v, ctx) => {
  if ((v.action === "STATUS") !== !!v.status || (v.action === "PRIORITY") !== !!v.priority) ctx.addIssue({ code: "custom", message: "Use fields for the chosen action only." });
});
export const messageSchema = z.strictObject({ expectedVersion: z.int().positive(), body: z.string().trim().min(2).max(4000), internal: z.boolean().default(false), requestKey: uuid });
export const capabilitiesForOperations = ["user-manager", "organization-manager", "staff-reader", "support-agent", "moderation-agent", "audit-reader", "operations-reader"];
export const managementToolCatalog = [
  ["users", "Users", "Find accounts, investigate access and revoke sessions.", "/management/users", "user-manager"],
  ["directory", "Organizations", "Oversee approved organizations and control platform access.", "/management/organizations", "organization-manager"],
  ["team", "Team access", "Inspect internal staff access; provision through the trusted terminal.", "/management/team", "staff-reader"],
  ["support", "Support", "Assign cases, reply to applicants and record internal notes.", "/management/support", "support-agent"],
  ["moderation", "Reports", "Investigate account and organization reports with an audit trail.", "/management/reports", "moderation-agent"],
  ["post-reviews", "Post review", "Review personal submissions before they appear in Explore.", "/management/post-reviews", "moderation-agent"],
  ["audit", "Audit log", "Trace current and historical management decisions.", "/management/audit", "audit-reader"],
  ["operations", "Operations", "Inspect review targets and maintenance workloads.", "/management/operations", "operations-reader"],
];
