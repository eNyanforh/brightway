import { organizationPermissionKeys } from "../organizations/organization-staff.schema.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { z } from "zod";
const fail = (status, message) => Object.assign(new Error(message), { status });
export const issuerPermission = kind => `organization.credentials.${kind}.review`;
const kinds = ["education", "experience"];
const permittedKinds = org => kinds.filter(kind => kind === "experience" || org.type === "SCHOOL" || org.offersTraining);
export async function credentialIssuer(db, id, kind, lock = false) {
  if (!z.uuid().safeParse(id).success) throw fail(400, "Choose a verified issuer from the directory.");
  const where = { id, status: "ACTIVE", request: { status: "APPROVED" } };
  if (lock && (await db.organization.updateMany({ where, data: { staffVersion: { increment: 0 } } })).count !== 1) throw fail(409, "The selected issuer is unavailable. Contact BrightWay support.");
  const org = await db.organization.findFirst({ where });
  if (!org || (kind && !permittedKinds(org).includes(kind))) throw fail(409, "The selected issuer cannot review this credential.");
  return org;
}
export async function credentialReviewerScope(db, actorId, organizationId, lock = false) {
  if (typeof actorId !== "string" || !actorId.trim()) throw fail(403, "Reviewer access is required.");
  const account = await db.account.findFirst({ where: { id: actorId, status: "ACTIVE", emailVerifiedAt: { not: null } } });
  if (!account) throw fail(403, "Reviewer access is required.");
  if (!organizationId) {
    if (account.platformRole !== "CREDENTIAL_REVIEWER") throw fail(403, "Reviewer access is required.");
    return { account, organization: null, kinds };
  }
  let organization;
  try { organization = await credentialIssuer(db, organizationId, undefined, lock); }
  catch (error) { if ([400, 409].includes(error.status)) throw fail(403, "Organization credential review is unavailable."); throw error; }
  const membership = await db.organizationMembership.findFirst({ where: { organizationId, accountId: actorId, enabled: true } });
  const allowed = membership ? permittedKinds(organization).filter(kind => membership.role === "PRIMARY_ADMIN" || (membership.permissions ?? []).includes(issuerPermission(kind))) : [];
  if (!allowed.length) throw fail(403, "This organization requires credential-review permission.");
  const catalog = organizationPermissionKeys(organization);
  const permissions = membership.role === "PRIMARY_ADMIN" ? catalog : (membership.permissions ?? []).filter(key => catalog.includes(key));
  return { account, organization, kinds: allowed, membership, permissions };
}
export async function authorizeCredentialReviewer(db, actorId, sessionId, organizationId, now, lock = false) {
  const scope = await credentialReviewerScope(db, actorId, organizationId, lock);
  await assertMfaSession(db, actorId, sessionId, now);
  return scope;
}
export function requireReviewScope(review, scope) {
  if ((review.issuerOrganizationId ?? null) !== (scope.organization?.id ?? null) || !scope.kinds.includes(review.kind)) throw fail(404, "Review not found.");
}
export async function reviewerStillAuthorized(db, accountId, review) {
  if (typeof accountId !== "string" || !accountId) return false;
  const account = await db.account.findFirst({ where: { id: accountId, status: "ACTIVE", emailVerifiedAt: { not: null } } });
  const factor = await db.mfaFactor.findUnique({ where: { accountId } });
  if (!account || !factor?.enabled) return false;
  if (!review.issuerOrganizationId) return account.platformRole === "CREDENTIAL_REVIEWER";
  const member = await db.organizationMembership.findFirst({ where: { organizationId: review.issuerOrganizationId, accountId, enabled: true } });
  return Boolean(member && (member.role === "PRIMARY_ADMIN" || (member.permissions ?? []).includes(issuerPermission(review.kind))));
}
export async function lockCredentialActors(db, ids) {
  // Match staffing's sorted account → organization lock order; revocation and decisions serialize.
  for (const id of [...new Set(ids)].sort()) {
    if ((await db.account.updateMany({ where: { id, status: "ACTIVE", emailVerifiedAt: { not: null } }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw fail(403, "An active account with verified email is required.");
  }
}
export const issuerSearchSchema = z.strictObject({ kind: z.enum(kinds), query: z.string().trim().min(2).max(100) });
