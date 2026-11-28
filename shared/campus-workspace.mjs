// Capabilities are resolved by the server from current membership and scoped grants.
export const CAMPUS_AREAS = Object.freeze([
  { key: 'overview', label: 'Dashboard', group: 'Campus' },
  { key: 'grade-school', label: 'Grade School', group: 'Academics' },
  { key: 'tvet', label: 'TVET', group: 'Academics' },
  { key: 'enrollment', label: 'Admissions & enrollment', group: 'Operations' },
  { key: 'staff', label: 'Staff & administration', group: 'Operations' },
  { key: 'billing', label: 'Finance & billing', group: 'Operations' },
  { key: 'announcements', label: 'Communications', group: 'Campus' },
  { key: 'reports', label: 'Reporting & settings', group: 'Campus' },
]);
export function campusAreas({ permissions = [], enginePermissions = {}, organizationPermissions = [] }) {
  const has = p => permissions.includes('organization.campus.' + p);
  const academic = engine => (enginePermissions[engine] || []).some(p => ['organization.campus.academics.manage', 'organization.campus.teach'].includes(p));
  const manager = Object.values(enginePermissions).some(p => p.includes('organization.campus.academics.manage'));
  const allowed = {
    overview: permissions.length > 0 || Object.values(enginePermissions).some(p => p.length) || organizationPermissions.some(p => ['organization.members.manage', 'organization.admissions.review'].includes(p)),
    'grade-school': academic('GRADE_SCHOOL'), tvet: academic('TVET'),
    enrollment: manager || organizationPermissions.includes('organization.admissions.review'),
    staff: has('manage') || organizationPermissions.includes('organization.members.manage'),
    billing: has('billing.manage'), announcements: permissions.length > 0 || Object.values(enginePermissions).some(p => p.length),
    reports: has('manage') || manager,
  };
  return CAMPUS_AREAS.filter(area => allowed[area.key]);
}
