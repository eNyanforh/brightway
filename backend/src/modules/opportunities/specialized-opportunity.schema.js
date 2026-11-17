import { z } from "zod";

// Dedicated, type-specific opportunity fields. Nullable at the opportunity
// level so previously published listings remain readable after migration.
const text = max => z.string().trim().max(max).refine(value =>
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
const entries = (count = 30, max = 160) => z.array(text(max).min(1)).max(count).default([]);
const optionalDate = z.union([z.iso.date(), z.literal("")]).default("");
const optionalNumber = max => z.number().int().min(0).max(max).nullable().default(null);
const field = (max = 160) => text(max).default("");

export const jobSpecificationInput = z.strictObject({
  category: text(120).min(2),
  experienceLevel: z.enum(["NO_EXPERIENCE", "ENTRY", "JUNIOR", "MID", "SENIOR", "MANAGER", "EXECUTIVE"]),
  vacancies: optionalNumber(100000),
  country: field(120), region: field(120), city: field(120), address: field(180),
  benefits: entries(30),
  minimumEducation: field(120), studyFields: entries(20),
  experienceMonths: optionalNumber(720),
  requiredSkills: entries(30), preferredSkills: entries(30),
  certifications: entries(20), languages: entries(20),
  responsibilities: entries(30, 500).pipe(z.array(text(500)).min(1)),
  requiredQualifications: entries(30, 500).pipe(z.array(text(500)).min(1)),
  preferredQualifications: entries(30, 500),
  expectedStartDate: optionalDate,
  documentQuestionIds: z.record(z.string(), z.uuid()).default({}),
  additionalDocuments: entries(10),
  applicationLimit: optionalNumber(100000),
  recruitmentStages: entries(10),
  expectedHiringDate: optionalDate,
  reviewerIds: z.array(z.uuid()).max(30).default([]),
}).superRefine((data, context) => {
  if (data.vacancies === 0) context.addIssue({ code: "custom", path: ["vacancies"], message: "Vacancies must be at least one." });
  if (data.applicationLimit === 0) context.addIssue({ code: "custom", path: ["applicationLimit"], message: "Application limit must be at least one." });
  if (new Set(data.reviewerIds).size !== data.reviewerIds.length) context.addIssue({ code: "custom", path: ["reviewerIds"], message: "Reviewers must be unique." });
  if (data.expectedHiringDate && data.expectedStartDate && data.expectedHiringDate > data.expectedStartDate)
    context.addIssue({ code: "custom", path: ["expectedHiringDate"], message: "Expected hiring date cannot be after the start date." });
});

export const scholarshipSpecificationInput = z.strictObject({
  category: text(120).min(2),
  academicLevels: z.array(text(120).min(1)).min(1).max(15),
  studyFields: entries(30),
  awards: optionalNumber(100000),
  fundingType: z.enum(["FULL", "PARTIAL", "FIXED", "TUITION_WAIVER", "STIPEND", "OTHER"]),
  scholarshipValue: z.number().min(0).max(1000000000).nullable().default(null),
  currency: z.enum(["USD", "LRD", "EUR", "GBP"]).nullable().default(null),
  fundingDurationMonths: optionalNumber(240),
  tuitionCoverage: z.enum(["100", "75", "50", "25", "CUSTOM", "NONE"]).default("NONE"),
  customTuitionPercent: z.number().min(0).max(100).nullable().default(null),
  livingAllowance: z.number().min(0).max(1000000000).nullable().default(null),
  accommodation: z.boolean().default(false),
  travelSupport: z.boolean().default(false),
  healthInsurance: z.boolean().default(false),
  booksMaterials: z.boolean().default(false),
  otherBenefits: entries(20),
  studyCountry: field(120), studyRegion: field(120),
  hostInstitution: field(160), programs: entries(20),
  programDurationMonths: optionalNumber(240), academicIntake: field(7),
  eligibleCountries: z.array(text(120).min(2)).min(1).max(250),
  minimumEducation: field(120), academicRequirement: field(300),
  eligibleStudyFields: entries(30),
  ageMin: optionalNumber(120), ageMax: optionalNumber(120),
  workExperienceMonths: optionalNumber(720),
  languages: entries(20), financialNeed: z.boolean().default(false),
  eligibilityCriteria: entries(25, 500),
  applicationsOpen: optionalDate,
  documentQuestionIds: z.record(z.string(), z.uuid()).default({}),
  additionalDocuments: entries(10),
  selectionCriteria: text(3000).min(10),
  selectionStages: entries(10),
  announcementDate: optionalDate,
}).superRefine((data, context) => {
  if (data.awards === 0) context.addIssue({ code: "custom", path: ["awards"], message: "Number of scholarships must be at least one." });
  if (data.ageMin !== null && data.ageMax !== null && data.ageMin > data.ageMax)
    context.addIssue({ code: "custom", path: ["ageMax"], message: "Maximum age must not be less than minimum age." });
  if (data.fundingType === "FIXED" && (data.scholarshipValue === null || !data.currency))
    context.addIssue({ code: "custom", path: ["scholarshipValue"], message: "Fixed funding requires an amount and currency." });
  if (data.scholarshipValue !== null && !data.currency)
    context.addIssue({ code: "custom", path: ["currency"], message: "Select a currency when entering a funding amount." });
  if (data.tuitionCoverage === "CUSTOM" && data.customTuitionPercent === null)
    context.addIssue({ code: "custom", path: ["customTuitionPercent"], message: "Enter a custom tuition coverage percentage." });
});

// Each built-in document toggle refers to an actual native FILE_UPLOAD
// question so application attachments use the existing secure upload workflow.
export function validateDocumentQuestions(specification, questions, context, path) {
  if (!specification) return;
  for (const [name, id] of Object.entries(specification.documentQuestionIds ?? {})) {
    const q = questions.find(value => value.id === id);
    if (!q || q.type !== "FILE_UPLOAD")
      context.addIssue({ code: "custom", path: [path, "documentQuestionIds", name], message: "Document requirements must have a matching file upload question." });
  }
}
