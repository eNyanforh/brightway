const destinations = new Set(["/profile", "/security", "/admin/credentials", "/explore", "/network", "/opportunities", "/learning", "/superadmin"]);
export function authDestination(requested) {
  if (requested === "/management" || requested?.startsWith("/superadmin/")) return "/superadmin";
  return destinations.has(requested) ? requested : "/explore";
}
