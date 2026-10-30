import { z } from "zod";
export const PROFILE_MANAGE = "organization.profile.manage";
const reserved = new Set(["admin", "administrator", "api", "brightway", "support", "security", "login", "register", "organizations", "settings", "work", "system"]);
export const profileVersion = z.number().int().min(0).max(2147483646);
export const organizationUsername = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,29}$/).refine(value => !reserved.has(value));
export const organizationProfileSchema = z.strictObject({ username: organizationUsername, expectedVersion: profileVersion });
const phone = z.string().trim().max(40).transform(value => value.replace(/[\s()-]/g, "") || null).nullable().refine(value => value === null || /^\+[1-9]\d{6,14}$/.test(value));
const email = z.string().trim().max(254).transform(value => value.toLowerCase() || null).nullable().refine(value => value === null || z.email().safeParse(value).success);
const website = z.string().trim().max(2048).transform(value => {
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !/[\s\\\u0000-\u001f\u007f]/.test(value) && url.hostname.includes(".") && url.href.length <= 2048 ? url.href : "INVALID";
  } catch { return "INVALID"; }
}).nullable().refine(value => value !== "INVALID");
export const organizationContactSchema = z.discriminatedUnion("field", [
  z.strictObject({ field: z.literal("phoneNumber"), value: phone, expectedVersion: profileVersion }),
  z.strictObject({ field: z.literal("contactEmail"), value: email, expectedVersion: profileVersion }),
  z.strictObject({ field: z.literal("website"), value: website, expectedVersion: profileVersion }),
]);
export function organizationSetupStep(organization) {
  if (!organization.username) return 1;
  if (!organization.profilePhotoId) return 2;
  return Math.max(3, Math.min(5, organization.profileSetupStep || 3));
}
export function organizationProfileReady(organization) {
  return Boolean(organization.profileReadyAt && organization.username && organization.profilePhotoId && organization.profileSetupStep === 5);
}
export function requireOrganizationProfile(organization) {
  if (!organizationProfileReady(organization)) throw Object.assign(Error("Finish this organization's profile setup before using its workspace. Contact details may be skipped."), { status: 409 });
}
export const organizationPhotoUrl = (organizationId, photoId) => photoId ? `/api/v1/organizations/${encodeURIComponent(organizationId)}/photo/${encodeURIComponent(photoId)}` : null;
