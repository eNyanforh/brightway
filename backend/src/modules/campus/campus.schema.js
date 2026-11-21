import { z } from "zod";

const text = max => z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const version = z.number().int().min(0).max(2147483646);
const email = z.string().trim().max(254).nullable().transform(value => value ? value.toLowerCase() : null).refine(value => value === null || z.email().safeParse(value).success);
const fields = { displayName: text(160), contactEmail: email };
export const CAMPUS_ENGINES = Object.freeze(["GRADE_SCHOOL", "TVET"]);
const engine = z.enum(CAMPUS_ENGINES);
const selectedEngines = z.array(engine).min(1).max(2).refine(values => new Set(values).size === values.length);
// Accept the historical single-engine payload without ambiguously accepting both
// forms. Responses always include the complete authoritative enabledEngines list.
export const setupInput = z.union([
  z.strictObject({ enabledEngines: selectedEngines, expectedVersion: version, ...fields }),
  z.strictObject({ engine, expectedVersion: version, ...fields }),
]).transform(input => {
  const enabledEngines = CAMPUS_ENGINES.filter(value => (input.enabledEngines || [input.engine]).includes(value));
  return { ...input, engine: enabledEngines[0], enabledEngines };
});
export const settingsInput = z.strictObject({ expectedVersion: version.min(1), ...fields });
export const transitionInput = z.strictObject({ expectedVersion: version.min(1) });
export const announcementInput = z.strictObject({ title: text(160), body: text(3000), requestKey: z.uuid(), audience: z.enum(["STAFF", "CAMPUS"]).default("STAFF") });
export const withdrawalInput = z.strictObject({ expectedVersion: version.min(1) });
export const announcementQuery = z.strictObject({ cursor: z.uuid().optional() });
export const CAMPUS_PERMISSIONS = Object.freeze({
  "organization.campus.manage": "Manage Virtual Campus settings",
  "organization.campus.announcements.manage": "Publish Campus announcements",
  "organization.campus.academics.manage": "Manage Campus academic operations",
  "organization.campus.teach": "Teach assigned Campus subjects",
  "organization.campus.billing.manage": "Manage Campus billing",
});
export const campusError = (status, message) => Object.assign(Error(message), { status });
export const campusId = id => {
  if (!z.uuid().safeParse(id).success) throw campusError(404, "Campus is unavailable.");
  return id;
};
export function campusParse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw campusError(400, "Check the Campus fields. Unknown or incomplete fields are not accepted.");
  return result.data;
}
export const allowedEngines = organization => organization.type === "SCHOOL" || organization.offersTraining === true ? [...CAMPUS_ENGINES] : [];
export const configuredEngines = campus => campus?.enabledEngines ?? (campus?.engine ? [campus.engine] : []);
export const enginesEligible = (campus, eligibility) => {
  const engines = configuredEngines(campus);
  return engines.length > 0 && engines.every(value => eligibility.supportedEngines.includes(value));
};
export function assessEligibility(organization, product) {
  const enabled = product?.enabled === true;
  const verifiedLiberiaOperation = (organization.locations || []).some(location => location.countryCode === "LR" && location.verifiedAt);
  const engines = allowedEngines(organization);
  const verifiedOrganization = organization.status === "ACTIVE" && organization.request?.status === "APPROVED" && Boolean(organization.verifiedAt);
  const eligible = enabled && verifiedLiberiaOperation && verifiedOrganization && engines.length > 0;
  return { eligible, productEnabled: enabled, verifiedLiberiaOperation, verifiedOrganization, supportedEngines: engines,
    reasons: [
      ...(!enabled ? ["Virtual Campus is not available in this location."] : []),
      ...(!verifiedLiberiaOperation ? ["A verified operating location in Liberia is required."] : []),
      ...(!verifiedOrganization ? ["BrightWay organization verification is required."] : []),
      ...(engines.length === 0 ? ["This organization is not approved for school or training services."] : []),
    ] };
}

export const enableEngineInput = z.strictObject({ engine, expectedVersion: version.min(1) });
export const engineConfigurationInput = z.strictObject({ expectedVersion: version.min(1), expectedEngineVersion: version.min(1), status: z.enum(["CONFIGURING", "READY"]) });
export const permissionGrantInput = z.strictObject({ expectedVersion: version.min(1), expectedGrantVersion: version, scope: z.enum(["CAMPUS", "GRADE_SCHOOL", "TVET"]), permission: z.enum(Object.keys(CAMPUS_PERMISSIONS)), enabled: z.boolean() });

export const onboardingInput = z.strictObject({ requestKey: z.uuid(), expectedVersion: version, step: z.int().min(1).max(4), displayName: z.string().trim().max(160).refine(v => !/[\u0000-\u001f\u007f]/.test(v)), enabledEngines: z.array(engine).max(2).refine(v => new Set(v).size === v.length) });
export const onboardingCompleteInput = z.strictObject({ expectedVersion: version.min(1), administratorMembershipId: z.uuid(), confirmed: z.literal(true) });
