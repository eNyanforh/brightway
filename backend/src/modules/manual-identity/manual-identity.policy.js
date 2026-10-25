import { createHash } from "node:crypto";
import { z } from "zod";

export const MANUAL_REVIEW_CONSENT = "manual-identity-review-v1";
export const submitIdentitySchema = z.strictObject({
  expectedVersion: z.number().int().min(0).max(2147483646),
  expectedProfileVersion: z.number().int().min(1).max(2147483646),
  idempotencyKey: z.uuid(),
  governmentId: z.uuid(),
  selfie: z.uuid(),
  consentVersion: z.literal(MANUAL_REVIEW_CONSENT),
}).refine((v) => v.governmentId !== v.selfie, { message: "Choose separate ID and selfie images." });
export const assignIdentitySchema = z.strictObject({ expectedVersion: z.number().int().min(1).max(2147483646) });
export const decideIdentitySchema = assignIdentitySchema.extend({
  attemptId: z.uuid(),
  status: z.enum(["APPROVED", "DECLINED", "ACTION_REQUIRED"]),
  note: z.string().trim().min(10).max(2000),
});
export const identityFailure = (status, message) => Object.assign(new Error(message), { status });
export const identityConflict = () => identityFailure(409, "This identity request or profile changed. Reload before continuing.");
export const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function reviewPolicy(config = process.env) {
  // No silent retention or holiday policy: these settings are required before new submissions.
  const retentionDays = Number(config.MANUAL_IDENTITY_RETENTION_DAYS);
  const holidays = (config.MANUAL_IDENTITY_HOLIDAYS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  return {
    retentionDays,
    holidays,
    calendarVersion: digest(["MON_FRI_UTC", [...holidays].sort()]),
    check() {
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365 || !holidays.every(validDate)) {
        throw identityFailure(503, "Configure identity evidence retention and the review calendar before accepting submissions.");
      }
    },
  };
}
export function fiveWorkingDaysAfter(value, holidays = []) {
  const date = new Date(value), excluded = new Set(holidays);
  if (!Number.isFinite(+date)) throw Error("Invalid submission date");
  let remaining = 5;
  while (remaining) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay()) && !excluded.has(date.toISOString().slice(0, 10))) remaining--;
  }
  return date;
}
export function identitySnapshot(account, profile, profileIdentityRevision = 0) {
  return {
    accountIdentityRevision: account.identityRevision ?? 0,
    personIdentityRevision: account.person.identityRevision ?? 0,
    profileIdentityRevision,
    firstName: account.person.firstName,
    middleName: account.person.middleName ?? null,
    lastName: account.person.lastName,
    birthDate: account.person.birthDate ? new Date(account.person.birthDate).toISOString().slice(0, 10) : null,
    gender: account.person.gender ?? null,
    email: account.email,
    countryCode: profile.location.countryCode,
    profilePhotoId: profile.photo?.id ?? null,
  };
}
