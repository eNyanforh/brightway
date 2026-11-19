/** Institutions use their ordinary Organization workspace while Virtual Campus is retired. */
export function organizationEntryPath(organization) {
  return `/organization-workspace/${encodeURIComponent(organization.id)}`;
}
