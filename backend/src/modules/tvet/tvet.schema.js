import { z } from "zod";
import { campusError } from "../campus/campus.schema.js";
export const fail = campusError;
export function parse(schema, input) { const r = schema.safeParse(input); if (!r.success) throw fail(400, r.error.issues.find(i => i.code === "custom")?.message || "Check the TVET fields. Unknown or incomplete fields are not accepted."); return r.data; }
export const id = z.uuid(), identifier = value => parse(id, value);
const text = max => z.string().trim().min(1).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const optionalText = max => z.string().trim().max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const version = z.number().int().min(1).max(2147483646), date = z.iso.date().transform(v => new Date(v + "T00:00:00Z")), username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/);
export const program = z.strictObject({ name: text(160), feeMinor: z.number().int().min(0).max(100000000), currency: z.string().regex(/^[A-Z]{3}$/), discoverProgramId: id.nullable().default(null) });
export const intake = z.strictObject({ programId: id, name: text(120), startsOn: date, endsOn: date, minimumAttendance: z.number().min(0).max(100).default(0) }).refine(v => v.endsOn >= v.startsOn, "An intake must end on or after its start date.");
export const section = z.strictObject({ intakeId: id, name: text(80), capacity: z.number().int().min(1).max(500) });
export const moduleInput = z.strictObject({ programId: id, name: text(120), required: z.boolean().default(true) });
export const assignment = z.strictObject({ intakeId: id, sectionId: id.nullable().default(null), moduleId: id.nullable().default(null), username });
export const instructor = z.strictObject({ expectedVersion: version, username: username.nullable() });
export const enrolment = z.strictObject({ username, intakeId: id, sectionId: id, source: z.enum(["DIRECT", "ADMISSION", "RETURNING"]), admissionId: id.nullable().default(null) }).refine(v => (v.source === "ADMISSION") === Boolean(v.admissionId), "Select an accepted admission only for admission enrolment.");
export const state = z.strictObject({ expectedVersion: version, status: z.enum(["ACTIVE", "SUSPENDED", "WITHDRAWN", "FORMER"]) });
export const expected = z.strictObject({ expectedVersion: version });
export const support = z.strictObject({ learnerId: id, username, relationship: z.enum(["PARENT", "GUARDIAN", "SPONSOR"]) });
export const supportDecision = z.strictObject({ expectedVersion: version, decision: z.enum(["CONFIRM", "REVOKE"]) });
export const schedule = z.strictObject({ assignmentId: id, weekday: z.number().int().min(1).max(7), startsAt: z.number().int().min(0).max(1439), endsAt: z.number().int().min(1).max(1440), room: optionalText(100).default("") }).refine(v => v.endsAt > v.startsAt, "The session must end after its start time.");
export const attendance = z.strictObject({ assignmentId: id, heldOn: date, startsAt: z.number().int().min(0).max(1439) });
export const attendanceSubmission = z.strictObject({ expectedVersion: version, finalize: z.boolean(), records: z.array(z.strictObject({ enrolmentId: id, status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]) })).max(500).refine(v => new Set(v.map(r => r.enrolmentId)).size === v.length, "Record each learner only once.") });
export const assessment = z.strictObject({ assignmentId: id, title: text(160), kind: z.enum(["SCORE", "COMPETENCY", "PRACTICAL"]), required: z.boolean().default(true), maxScore: z.number().gt(0).max(100000).nullable().default(null), passingMark: z.number().min(0).max(100).nullable().default(null), heldOn: date }).refine(v => v.kind === "SCORE" ? v.maxScore !== null && v.passingMark !== null : v.maxScore === null && v.passingMark === null, "Score assessments require a maximum score and passing percentage. Competency and practical assessments use an outcome.");
export const result = z.strictObject({ attempt: z.number().int().min(1).max(100), expectedVersion: z.number().int().min(0).max(2147483646), heldOn: date, finalize: z.boolean(), score: z.number().min(0).max(100000).nullable().default(null), outcome: z.enum(["COMPETENT", "NOT_YET_COMPETENT"]).nullable().default(null), feedback: optionalText(500).default("") });
export const certificate = z.strictObject({ expectedVersion: version, title: text(160) });
export const revocation = z.strictObject({ expectedVersion: version, reason: text(500) });
export const query = z.strictObject({ intakeId: id.optional(), cursor: id.optional(), q: optionalText(80).default("") });
export function outcomeFor(a, input) {
 if (a.kind === "SCORE") { if (input.score === null || input.score > a.maxScore || input.outcome !== null) throw fail(400, "Enter a score within the assessment maximum. Its outcome is calculated automatically."); return input.score / a.maxScore * 100 >= a.passingMark ? "COMPETENT" : "NOT_YET_COMPETENT"; }
 if (input.score !== null || !input.outcome) throw fail(400, "Choose Competent or Not Yet Competent for this practical or competency assessment."); return input.outcome;
}
export function checkRoster(roster, records, finalize) { const ids = new Set(roster.map(r => r.id)); if (records.some(r => !ids.has(r.enrolmentId)) || (finalize && (!ids.size || records.length !== ids.size))) throw fail(400, "Final attendance requires every active learner in this assignment exactly once."); }
export function progress({ assessments, results, modules, attendance, minimumAttendance }) {
 results = results.filter(r => r.status === "FINAL"); const required = assessments.filter(a => a.required), blockers = [];
 const rows = assessments.map(a => ({ ...a, attempts: results.filter(r => r.assessmentId === a.id).sort((x,y) => x.attempt-y.attempt) }));
 for (const a of required) if (!results.some(r => r.assessmentId === a.id && r.outcome === "COMPETENT")) blockers.push("Complete: " + a.title);
 for (const m of modules.filter(m => m.required)) if (!required.some(a => a.assignment.moduleId === m.id)) blockers.push("No required assessment configured for: " + m.name);
 if (!required.length) blockers.push("At least one required assessment must be configured and passed.");
 const counted = attendance.filter(r => r.status !== "EXCUSED"), attended = counted.filter(r => ["PRESENT","LATE"].includes(r.status)).length, percent = counted.length ? Math.round(attended/counted.length*10000)/100 : null;
 if (minimumAttendance > 0 && (!counted.length || attended/counted.length*100 < minimumAttendance)) blockers.push("Minimum attendance has not been met.");
 return { assessments: rows, attendancePercent: percent, minimumAttendance, blockers, eligible: blockers.length === 0 };
}
