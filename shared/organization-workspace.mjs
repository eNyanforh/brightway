// Product navigation metadata only. Domain APIs still enforce every permission and tenant boundary.
export function organizationWorkspace(organization, permissions = [], role = "STAFF") {
  const base = `/organization-workspace/${organization.id}`;
  const has = key => permissions.includes(key);
  const available = [
    { key: "profile", label: "Profile", shortLabel: "Profile", icon: "work", to: `${base}/profile`, description: "Your organization profile and verified operating locations." },
    { key: "dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: "explore", to: base, description: "Your organization account and available tools." },
  ];
  if (has("organization.members.manage")) available.push({ key: "staff", label: "Staff", shortLabel: "Staff", icon: "network", to: `${base}/staff`, sensitive: true, description: "Invite staff, manage permissions and revoke access." });
  if (["education", "experience"].some(kind => has(`organization.credentials.${kind}.review`))) available.push({ key: "credentials", label: "Credential Review", shortLabel: "Reviews", icon: "learning", to: `${base}/credentials`, sensitive: true, description: "Review education or experience claims submitted to this issuer." });
  if (has("organization.posts.publish")) available.push({ key: "posts", label: "Posts", shortLabel: "Posts", icon: "post", to: `${base}/posts`, sensitive: true, description: "Publish or withdraw posts from your organization." });
  const planned = [];
  if (has("organization.opportunities.manage")) available.push({ key: "opportunities", label: "Opportunities", icon: "opportunities", to: `${base}/opportunities`, sensitive: true, description: "Publish jobs, scholarships, challenges and events." });
  if (has("organization.applications.review")) available.push({ key: "applications", label: "Applications", icon: "applications", to: `${base}/applications`, sensitive: true, description: "Review applications, participation and registrations." });
  if (organization.offersTraining || organization.type === "SCHOOL") {
    if (has("organization.programs.manage")) planned.push({ key: "programs", label: "Programs", sprint: 7, description: "Manage education/training offerings shown in Discover." });
    if (has("organization.admissions.review")) planned.push({ key: "admissions", label: "Admissions", sprint: 7, description: "Manage admission cycles and applicant decisions." });
  }
  // Informational setup entry only: no activation, eligibility attestation or billing authority.
  const campusSetup = role === "PRIMARY_ADMIN" && (organization.type === "SCHOOL" || organization.offersTraining)
    ? { label: "Build Campus", to: `${base}/campus`, status: "COMING_SOON" } : null;
  return { available, planned, campusActive: false, campusSetup };
}
