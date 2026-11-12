export const managementPaths = {
  "/management/billing": "/superadmin/billing",
  "/management/official-messages": "/superadmin/official-messages",
  "/management/users": "/superadmin/users",
  "/management/organizations": "/superadmin/directory",
  "/management/team": "/superadmin/team",
  "/management/support": "/superadmin/support",
  "/management/reports": "/superadmin/reports",
  "/management/post-reviews": "/superadmin/post-reviews",
  "/management/audit": "/superadmin/audit",
  "/management/operations": "/superadmin/operations",
  "/admin/credentials": "/superadmin/credentials",
  "/admin/manual-identity": "/superadmin/identity",
  "/admin/profile-photos": "/superadmin/photos",
  "/admin/name-changes": "/superadmin/names",
  "/admin/organizations": "/superadmin/organizations",
};
export const managementPath = path => managementPaths[path] || path;

export function validManagementContext(data, staffId) {
  return data?.allowed === true && data.staffId === staffId && !!data.role && Array.isArray(data.tools) && Array.isArray(data.audits) && data.tools.every(tool => typeof tool.allowed === "boolean" && Object.hasOwn(managementPaths,tool.to));
}
