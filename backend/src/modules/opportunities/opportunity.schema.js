import { z } from "zod";
import { OPPORTUNITY_TYPES, QUESTION_TYPES } from "../../../../shared/opportunities.mjs";
import { CHALLENGE_COVER_IMAGES, CHALLENGE_TOPIC_OPTIONS, DEFAULT_CHALLENGE_COVER, MAX_CHALLENGE_TOPICS, CHALLENGE_PRIZE_TYPES, CHALLENGE_PRIZE_CURRENCIES, CHALLENGE_MEDIA_KINDS, MAX_CHALLENGE_SPONSORS, MAX_CHALLENGE_COLLABORATORS, MAX_CHALLENGE_PRIZES } from "../../../../shared/challenges.mjs";
import { fail } from "../network/network.schema.js";
import { CHALLENGE_POST_TYPES, MAX_CHALLENGE_POST_TYPES, countChallengeWords } from "../../../../shared/challenge-submissions.mjs";

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
// Structured prizes use different required fields for each award category.
// The legacy {type, description} shape remains accepted so existing drafts
// and published Challenges can still be edited without losing their rewards.
const typedPrize = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("CASH"), amount: z.number().positive().max(1000000000),
    currency: z.enum(Object.keys(CHALLENGE_PRIZE_CURRENCIES)) }),
  z.strictObject({ type: z.literal("SCHOLARSHIP"), coverage: text(120).min(2),
    institution: text(120).default("") }),
  z.strictObject({ type: z.literal("CERTIFICATE"), title: text(120).min(2),
    issuer: text(120).default("") }),
  z.strictObject({ type: z.literal("MENTORSHIP"), focus: text(120).min(2),
    sessions: z.number().int().min(1).max(1000) }),
  z.strictObject({ type: z.literal("EQUIPMENT"), item: text(120).min(2),
    quantity: z.number().int().min(1).max(100000) }),
  z.strictObject({ type: z.literal("INTERNSHIP"), role: text(120).min(2),
    duration: text(80).min(2) }),
  z.strictObject({ type: z.literal("OTHER"), title: text(120).min(2),
    details: text(120).min(2) }),
]);
const legacyPrize = z.strictObject({
  type: z.enum(Object.keys(CHALLENGE_PRIZE_TYPES)), description: text(120).min(1),
});
const postRequirement = z.discriminatedUnion("type", [
  z.strictObject({ id: identifier, type: z.literal("VIDEO_POST"),
    minDurationSeconds: z.number().int().min(1).max(3600),
    maxDurationSeconds: z.number().int().min(1).max(3600),
  }).refine(v => v.minDurationSeconds <= v.maxDurationSeconds),
  z.strictObject({ id: identifier, type: z.literal("CAPTION"),
    minWords: z.number().int().min(1).max(1000), maxWords: z.number().int().min(1).max(1000),
  }).refine(v => v.minWords <= v.maxWords),
  z.strictObject({ id: identifier, type: z.literal("PHOTO_POST"),
    minImages: z.number().int().min(1).max(4), maxImages: z.number().int().min(1).max(4),
  }).refine(v => v.minImages <= v.maxImages),
  z.strictObject({ id: identifier, type: z.literal("DOCUMENT_POST"),
    maxPages: z.number().int().min(1).max(100),
  }),
]);
export const opportunityInput = z.strictObject({
  type: z.enum(Object.keys(OPPORTUNITY_TYPES)), title: text(160).min(3), description: text(12000).min(30),
  location: text(180).min(2), workMode: z.enum(["IN_PERSON", "REMOTE", "HYBRID"]),
  prize: text(120).nullish().transform(value => value ?? ""),
  prizes: z.array(z.union([typedPrize, legacyPrize])).max(MAX_CHALLENGE_PRIZES).default([]),
  postRequirements: z.array(postRequirement).max(MAX_CHALLENGE_POST_TYPES)
    .refine(rows => new Set(rows.map(row => row.type)).size === rows.length &&
      new Set(rows.map(row => row.id)).size === rows.length,
      "Choose each post type only once.").default([]),
  sponsorLogoIds: z.array(identifier).max(MAX_CHALLENGE_SPONSORS)
    .refine(ids => new Set(ids).size === ids.length, "Sponsor logos must be unique.").default([]),
  backgroundAssetId: identifier.nullish().transform(value => value ?? null),
  titleAssetId: identifier.nullish().transform(value => value ?? null),
  coverAssetId: identifier.nullish().transform(value => value ?? null),
  collaboratorIds: z.array(identifier).max(MAX_CHALLENGE_COLLABORATORS)
    .refine(ids => new Set(ids).size === ids.length, "Collaborators must be unique.").default([]),

  topics: z.array(z.enum(CHALLENGE_TOPIC_OPTIONS)).max(MAX_CHALLENGE_TOPICS)
    .refine(values => new Set(values).size === values.length).default([]),
  coverImage: z.enum(Object.keys(CHALLENGE_COVER_IMAGES)).default(DEFAULT_CHALLENGE_COVER),
  deadline: z.iso.datetime({ offset: true }),
  questions: z.array(question).max(20).refine(q => new Set(q.map(v => v.id)).size === q.length)
    .refine(q => q.filter(v => v.type === "FILE_UPLOAD").length <= 5),
});
export const collaboratorSearchInput = z.strictObject({
  q: z.string().trim().min(2).max(80),
});
export const collaboratorResponseInput = z.strictObject({
  decision: z.enum(["ACCEPTED", "DECLINED"]),
});
export const challengeAssetUploadInput = z.strictObject({ kind: z.enum(Object.keys(CHALLENGE_MEDIA_KINDS)) });
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
  answers: z.record(identifier, z.union([text(5000), z.boolean(), z.array(text(150).min(1)).max(12)])).refine(v => Object.keys(v).length <= 20 + MAX_CHALLENGE_POST_TYPES),
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

export function validateAnswers(questions, answers, attachments, complete, postRequirements = []) {
  if (Object.keys(answers).some(id => !questions.some(q => q.id === id && q.type !== "FILE_UPLOAD") &&
    !postRequirements.some(r => r.id === id)))
    throw fail(400, "The application questions changed. Reload before continuing.");
  for (const req of postRequirements) {
    const answer = answers[req.id];
    if ((answer === undefined || answer === "") && complete)
      throw fail(400, `Add a ${CHALLENGE_POST_TYPES[req.type]} for your Challenge submission.`);
    if (answer === undefined || answer === "") continue;
    if (typeof answer !== "string") throw fail(400, "Enter a BrightWay post link or caption.");
    if (req.type === "CAPTION") {
      const count = countChallengeWords(answer);
      if (count > req.maxWords || count < req.minWords)
        throw fail(400, `Caption must have ${req.minWords}–${req.maxWords} words.`);
    } else if (!identifier.safeParse(answer).success) {
      throw fail(400, "Use a valid BrightWay post ID for your submission.");
    }
  }
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
