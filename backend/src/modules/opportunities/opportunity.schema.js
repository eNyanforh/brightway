import { z } from "zod";
import { OPPORTUNITY_TYPES, QUESTION_TYPES } from "../../../../shared/opportunities.mjs";
import { CHALLENGE_COVER_IMAGES, CHALLENGE_TOPIC_OPTIONS, DEFAULT_CHALLENGE_COVER, MAX_CHALLENGE_TOPICS } from "../../../../shared/challenges.mjs";
import { fail } from "../network/network.schema.js";

export const identifier = z.uuid();
export const version = z.number().int().min(0).max(2147483646);
const text = max => z.string().trim().max(max).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const question = z.strictObject({
  id: identifier, label: text(300).min(3), type: z.enum(Object.keys(QUESTION_TYPES)), required: z.boolean(),
  options: z.array(text(150).min(1)).max(12).default([]),
}).superRefine((q, ctx) => {
  const choice = ["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type);
  if (choice ? q.options.length < 2 || new Set(q.options).size !== q.options.length : q.options.length !== 0)
    ctx.addIssue({ code: "custom", message: "Choice questions need 2–12 different options; other questions have no options." });
});
export const opportunityInput = z.strictObject({
  type: z.enum(Object.keys(OPPORTUNITY_TYPES)), title: text(160).min(3), description: text(12000).min(30),
  location: text(180).min(2), workMode: z.enum(["IN_PERSON", "REMOTE", "HYBRID"]),
  prize: text(120).nullish().transform(value => value ?? ""),
  topics: z.array(z.enum(CHALLENGE_TOPIC_OPTIONS)).max(MAX_CHALLENGE_TOPICS)
    .refine(values => new Set(values).size === values.length).default([]),
  coverImage: z.enum(Object.keys(CHALLENGE_COVER_IMAGES)).default(DEFAULT_CHALLENGE_COVER),
  deadline: z.iso.datetime({ offset: true }),
  questions: z.array(question).max(20).refine(q => new Set(q.map(v => v.id)).size === q.length)
    .refine(q => q.filter(v => v.type === "FILE_UPLOAD").length <= 5),
});
export const saveInput = z.strictObject({ saved: z.boolean() });
export const createInput = opportunityInput.extend({ requestKey: identifier });
export const editInput = opportunityInput.extend({ expectedVersion: version });
export const statusInput = z.strictObject({ expectedVersion: version, status: z.enum(["PUBLISHED", "PAUSED", "CLOSED", "CANCELLED", "REMOVED"]) });
export const browseInput = z.strictObject({
  q: text(80).default(""), type: z.enum(Object.keys(OPPORTUNITY_TYPES)).optional(), cursor: identifier.optional(),
  saved: z.enum(["true"]).optional(),
  following: z.enum(["true"]).optional(),
});
export const listInput = z.strictObject({ cursor: identifier.optional() });
export const reviewListInput = z.strictObject({ cursor: identifier.optional(), opportunityId: identifier.optional(),
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SELECTED", "NOT_SELECTED", "WITHDRAWN"]).optional() });
export const applicationInput = z.strictObject({
  expectedVersion: version, expectedOpportunityVersion: version,
  action: z.enum(["SAVE", "SUBMIT"]),
  shareProfile: z.boolean().default(false),
  // Separate opt-in for displaying participation on public Challenge cards.
  publicParticipant: z.boolean().default(false),
  answers: z.record(identifier, z.union([text(5000), z.boolean(), z.array(text(150).min(1)).max(12)])).refine(v => Object.keys(v).length <= 20),
});
export const withdrawInput = z.strictObject({ expectedVersion: version });
export const decisionInput = z.strictObject({ expectedVersion: version,
  status: z.enum(["UNDER_REVIEW", "SHORTLISTED", "SELECTED", "NOT_SELECTED"]), feedback: text(1000).default("") });
export const uploadInput = z.strictObject({ expectedVersion: z.coerce.number().pipe(version), questionId: identifier });

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw fail(400, result.error.issues[0]?.message || "Check the opportunity form.");
  return result.data;
}

export function validateAnswers(questions, answers, attachments, complete) {
  if (Object.keys(answers).some(id => !questions.some(q => q.id === id && q.type !== "FILE_UPLOAD")))
    throw fail(400, "The application questions changed. Reload before continuing.");
  for (const q of questions) {
    const value = answers[q.id];
    const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (q.type === "FILE_UPLOAD") {
      if (complete && q.required && !attachments.some(a => a.questionId === q.id)) throw fail(400, `Upload a file for: ${q.label}`);
      continue;
    }
    if (empty) { if (complete && q.required) throw fail(400, `Complete: ${q.label}`); continue; }
    const valid = q.type === "YES_NO" ? typeof value === "boolean"
      : q.type === "MULTIPLE_CHOICE" ? Array.isArray(value) && new Set(value).size === value.length && value.every(v => q.options.includes(v))
      : q.type === "SINGLE_CHOICE" ? typeof value === "string" && q.options.includes(value)
      : typeof value === "string" && value.length <= (q.type === "SHORT_ANSWER" ? 500 : 5000);
    if (!valid) throw fail(400, `Check your answer to: ${q.label}`);
  }
}

export const opportunityTransitions = {
  DRAFT: ["PUBLISHED", "CANCELLED", "REMOVED"], PUBLISHED: ["PAUSED", "CLOSED", "CANCELLED", "REMOVED"],
  PAUSED: ["PUBLISHED", "CLOSED", "CANCELLED", "REMOVED"], CLOSED: ["REMOVED"], CANCELLED: ["REMOVED"], REMOVED: [],
};
export const applicationTransitions = {
  SUBMITTED: ["UNDER_REVIEW", "SHORTLISTED", "SELECTED", "NOT_SELECTED"],
  UNDER_REVIEW: ["SHORTLISTED", "SELECTED", "NOT_SELECTED"], SHORTLISTED: ["UNDER_REVIEW", "SELECTED", "NOT_SELECTED"],
  SELECTED: [], NOT_SELECTED: [], WITHDRAWN: [], DRAFT: [],
};
