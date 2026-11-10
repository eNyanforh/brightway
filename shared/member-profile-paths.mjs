// Root-level member profile URLs must never shadow application paths.
// The registration validator and client routing share these reserved handles.
export const reservedMemberHandles = new Set([
  "admin", "api", "app", "assets", "auth", "credentials", "explore",
  "forgot-password", "help", "home", "learn", "learning", "login",
  "management", "manual-identity", "network", "notifications",
  "opportunities", "organization-workspace", "organizations",
  "partners", "people", "posts", "profile", "register", "search",
  "security", "settings", "signup", "superadmin", "work",
]);

export function memberProfilePath(username) {
  return "/" + encodeURIComponent(username);
}
