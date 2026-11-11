const destinations = new Set(["/profile", "/security", "/admin/credentials", "/explore", "/network", "/opportunities", "/learning", "/superadmin"]);
export function authDestination(requested) {
  if (typeof requested === "string" && /^\/(?:opportunities|applications)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)) return requested;
  if (requested === "/management" || requested?.startsWith("/superadmin/")) return "/superadmin";
  return destinations.has(requested) ? requested : "/explore";
}
