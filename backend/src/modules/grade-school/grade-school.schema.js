import { z } from "zod";
import { campusError } from "../campus/campus.schema.js";
export const fail = campusError;
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw fail(400, result.error.issues.find(i => i.code === "custom" && i.message !== "Invalid input")?.message || "Check the academic fields. Unknown or incomplete fields are not accepted.");
  return result.data;
}
export const id = z.uuid();
const text = max => z.string().trim().min(1).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const version = z.number().int().min(1).max(2147483646);
const unique = values => new Set(values).size === values.length;
const date = z.iso.date().transform(v => new Date(v + "T00:00:00Z"));
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/);
export const subject = z.strictObject({ name: text(120), passingMark: z.number().min(0).max(100) });
export const schoolClass = z.strictObject({ name: text(100) });
export const section = z.strictObject({ classId: id, name: text(60), capacity: z.number().int().min(1).max(500) });
export const year = z.strictObject({ name: text(100), startsOn: date, endsOn: date }).refine(v => {
  const minimum = new Date(v.startsOn), day = minimum.getUTCDate();
  minimum.setUTCDate(1); minimum.setUTCMonth(minimum.getUTCMonth() + 5); minimum.setUTCDate(0);
  minimum.setUTCDate(Math.min(day, minimum.getUTCDate()));
  return v.endsOn > minimum;
}, "Academic years must last more than four months.");
export const period = z.strictObject({ yearId: id, name: text(100), kind: z.enum(["TERM", "SEMESTER"]), startsOn: date, endsOn: date }).refine(v => v.endsOn > v.startsOn);
export const offering = z.strictObject({ periodId: id, sectionId: id, subjectId: id, mode: z.enum(["COMPULSORY", "ELECTIVE"]) });
export const assignment = z.strictObject({ expectedVersion: version, username: username.nullable() });
export const registration = z.strictObject({ username, periodId: id, sectionId: id, source: z.enum(["DIRECT", "ADMISSION", "RETURNING"]), admissionId: id.nullable().default(null), electiveIds: z.array(id).max(50).refine(unique).default([]) }).refine(v => (v.source === "ADMISSION") === Boolean(v.admissionId));
export const status = z.strictObject({ expectedVersion: version, status: z.enum(["ACTIVE", "SUSPENDED", "FORMER"]) });
export const guardian = z.strictObject({ studentId: id, username, relationship: text(60) });
export const guardianDecision = z.strictObject({ expectedVersion: version, decision: z.enum(["CONFIRM", "REVOKE"]) });
export const schedule = z.strictObject({ offeringId: id, weekday: z.number().int().min(1).max(7), startsAt: z.number().int().min(0).max(1439), endsAt: z.number().int().min(1).max(1440), room: z.string().trim().max(100).default("") }).refine(v => v.endsAt > v.startsAt);
export const attendance = z.strictObject({ offeringId: id, heldOn: date, startsAt: z.number().int().min(0).max(1439).default(0) });
export const assessment = z.strictObject({ offeringId: id, title: text(160), maxScore: z.number().gt(0).max(100000), weight: z.number().gt(0).max(100), heldOn: date });
const attendanceRecord = z.strictObject({ registrationId: id, status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]) });
const score = z.strictObject({ registrationId: id, score: z.number().min(0).max(100000) });
export const submission = kind => z.strictObject({ expectedVersion: version, finalize: z.boolean(), records: z.array(kind === "attendance" ? attendanceRecord : score).max(500).refine(v => unique(v.map(r => r.registrationId))) });
export const query = z.strictObject({ periodId: id.optional(), cursor: id.optional(), q: z.string().trim().max(80).default("") });
export const identifier = value => parse(id, value);
export const transitions = { PRE_REGISTERED: ["ACTIVE", "FORMER"], ACTIVE: ["SUSPENDED", "FORMER"], SUSPENDED: ["ACTIVE", "FORMER"], FORMER: [] };
export function completeRoster(roster, records, final) {
  const allowed = new Set(roster.map(r => r.id));
  if (records.some(r => !allowed.has(r.registrationId)) || (final && (records.length !== allowed.size || !allowed.size))) throw fail(400, "Include every registered student exactly once before final submission. Records outside this subject are not accepted.");
}
export function calculateGrade(scores, passingMark) {
  const total = scores.reduce((sum, r) => sum + r.weight, 0);
  const percent = total ? Math.round(scores.reduce((sum, r) => sum + r.score / r.maxScore * 100 * r.weight, 0) / total * 100) / 100 : null;
  return { percent, passingMark, outcome: percent === null ? "NOT_ASSESSED" : percent >= passingMark ? "PASS" : "BELOW_PASS", assessedWeight: total };
}
