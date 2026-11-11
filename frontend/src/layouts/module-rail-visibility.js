import { reservedMemberHandles } from "../../../shared/member-profile-paths.mjs";

// Profile pages already own their internal content/sidebar layout. The global
// discovery rail must not be added as a fourth column to either profile route.
export function shouldShowModuleRightRail(pathname) {
  if (pathname === "/explore" || pathname === "/profile" || pathname.startsWith("/profile/")) return false;
  if (pathname === "/superadmin" || pathname.startsWith("/superadmin/")) return false;
  if (pathname === "/organization-workspace" || pathname.startsWith("/organization-workspace/")) return false;
  const publicHandle = /^\/([a-zA-Z0-9_]+)\/?$/.exec(pathname)?.[1]?.toLowerCase();
  if (publicHandle && !reservedMemberHandles.has(publicHandle)) return false;
  return true;
}
