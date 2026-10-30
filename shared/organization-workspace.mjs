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
  const planned = [];
  if (has("organization.posts.publish")) planned.push({ key: "posts", label: "Posts & content", sprint: 5, description: "Publish organization content and manage its interactions." });
  if (has("organization.opportunities.manage")) planned.push(
    { key: "opportunities", label: "Opportunities", sprint: 6, description: "Publish jobs, scholarships, challenges and events." },
    { key: "applications", label: "Applications", sprint: 6, description: "Review on-BrightWay applications, participation and registrations." },
  );
  if (organization.offersTraining || organization.type === "SCHOOL") {
    if (has("organization.programs.manage")) planned.push({ key: "programs", label: "Programs", sprint: 7, description: "Manage education/training offerings shown in Discover." });
    if (has("organization.admissions.review")) planned.push({ key: "admissions", label: "Admissions", sprint: 7, description: "Manage admission cycles and applicant decisions." });
  }
  // Informational setup entry only: no activation, eligibility attestation or billing authority.
  const campusSetup = role === "PRIMARY_ADMIN" && (organization.type === "SCHOOL" || organization.offersTraining)
    ? { label: "Build Campus", to: `${base}/campus`, status: "COMING_SOON" } : null;
  return { available, planned, campusActive: false, campusSetup };
}
