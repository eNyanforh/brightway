import { z } from "zod";
export const PROFILE_MANAGE = "organization.profile.manage";
const reserved = new Set(["admin", "administrator", "api", "brightway", "support", "security", "login", "register", "organizations", "settings", "work", "system"]);
export const profileVersion = z.number().int().min(0).max(2147483646);
export const organizationUsername = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,29}$/).refine(value => !reserved.has(value));
export const organizationProfileSchema = z.strictObject({ username: organizationUsername, expectedVersion: profileVersion });
export function organizationProfileReady(organization) {
  return Boolean(organization.profileReadyAt && organization.username && organization.profilePhotoId);
}
export function requireOrganizationProfile(organization) {
  if (!organizationProfileReady(organization)) throw Object.assign(Error("Complete this organization's username and profile picture before using its workspace."), { status: 409 });
}
export const organizationPhotoUrl = (organizationId, photoId) => photoId ? `/api/v1/organizations/${encodeURIComponent(organizationId)}/photo/${encodeURIComponent(photoId)}` : null;
