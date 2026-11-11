import { z } from "zod";

const text = max => z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const version = z.number().int().min(0).max(2147483646);
const email = z.string().trim().max(254).nullable().transform(value => value ? value.toLowerCase() : null).refine(value => value === null || z.email().safeParse(value).success);
const fields = { displayName: text(160), contactEmail: email };
export const setupInput = z.strictObject({ engine: z.enum(["GRADE_SCHOOL", "TVET"]), expectedVersion: version, ...fields });
export const settingsInput = z.strictObject({ expectedVersion: version.min(1), ...fields });
export const transitionInput = z.strictObject({ expectedVersion: version.min(1) });
export const announcementInput = z.strictObject({ title: text(160), body: text(3000), requestKey: z.uuid() });
export const withdrawalInput = z.strictObject({ expectedVersion: version.min(1) });
export const announcementQuery = z.strictObject({ cursor: z.uuid().optional() });
export const CAMPUS_PERMISSIONS = Object.freeze({
  "organization.campus.manage": "Manage Virtual Campus settings",
  "organization.campus.announcements.manage": "Publish Campus announcements",
  "organization.campus.academics.manage": "Manage Campus academic operations",
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
export const allowedEngines = organization => [
  ...(organization.type === "SCHOOL" ? ["GRADE_SCHOOL"] : []),
  ...(organization.offersTraining ? ["TVET"] : []),
];
export function assessEligibility(organization, product) {
  const enabled = product?.enabled === true;
  const verifiedLiberiaOperation = (organization.locations || []).some(location => location.countryCode === "LR" && location.verifiedAt && new Date(location.verifiedAt).getTime() <= Date.now());
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
