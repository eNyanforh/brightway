import { configuredEngines } from './campus.schema.js';

export const scopePermissions = Object.freeze({
  CAMPUS: ['organization.campus.manage', 'organization.campus.announcements.manage', 'organization.campus.billing.manage'],
  GRADE_SCHOOL: ['organization.campus.academics.manage', 'organization.campus.teach'],
  TVET: ['organization.campus.academics.manage', 'organization.campus.teach'],
});

export async function campusMemberPermissions(db, campus, membership, scope = 'CAMPUS') {
  if (!membership?.enabled || !scopePermissions[scope] || !campus) return [];
  if (scope !== 'CAMPUS' && !configuredEngines(campus).includes(scope)) return [];
  if (membership.role === 'PRIMARY_ADMIN') return [...scopePermissions[scope]];
  // Historical broad grants apply only to the original engine. Adding TVET to
  // a school must never silently promote its teachers into TVET administrators.
  const legacy = scope === 'CAMPUS' || scope === campus.engine ? membership.permissions || [] : [];
  const effective = new Set(legacy.filter(key => scopePermissions[scope].includes(key)));
  const grants = await db.campusPermissionGrant.findMany({ where: { campusId: campus.organizationId, membershipId: membership.id, scope } });
  for (const grant of grants) {
    if (grant.enabled) effective.add(grant.permission);
    else effective.delete(grant.permission); // Explicit revocation also suppresses a legacy grant.
  }
  return [...effective].sort();
}
