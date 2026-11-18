/** Choose the institution's primary workspace without granting permissions.
 * Real access and eligibility are still enforced by the Campus and organization gates.
 */
export function organizationEntryPath(organization) {
  const id = encodeURIComponent(organization.id);
  const primary = organization.role === "PRIMARY_ADMIN";
  const campusInstitution = organization.type === "SCHOOL" || organization.offersTraining === true;
  return primary && campusInstitution ? `/campus/${id}` : `/organization-workspace/${id}`;
}
