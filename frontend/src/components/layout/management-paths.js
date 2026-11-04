export const managementPaths = {
  "/management/users": "/superadmin/users",
  "/management/organizations": "/superadmin/directory",
  "/management/team": "/superadmin/team",
  "/management/support": "/superadmin/support",
  "/management/reports": "/superadmin/reports",
  "/management/audit": "/superadmin/audit",
  "/management/operations": "/superadmin/operations",
  "/admin/credentials": "/superadmin/credentials",
  "/admin/manual-identity": "/superadmin/identity",
  "/admin/profile-photos": "/superadmin/photos",
  "/admin/name-changes": "/superadmin/names",
  "/admin/organizations": "/superadmin/organizations",
};
export const managementPath = path => managementPaths[path] || path;
