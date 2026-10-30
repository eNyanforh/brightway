export const managementPaths = {
  "/admin/credentials": "/superadmin/credentials",
  "/admin/manual-identity": "/superadmin/identity",
  "/admin/profile-photos": "/superadmin/photos",
  "/admin/name-changes": "/superadmin/names",
  "/admin/organizations": "/superadmin/organizations",
};
export const managementPath = path => managementPaths[path] || path;
