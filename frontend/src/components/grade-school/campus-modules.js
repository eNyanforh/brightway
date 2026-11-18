// The Campus module registry is the single source for institutional navigation
// and the corresponding route-level feature selection. Backend services remain
// authoritative for tenant, assignment and permission checks.
export const CAMPUS_MODULES = Object.freeze({
  GRADE_SCHOOL: [
    { section: "school-setup", label: "Academic setup", icon: "learning", access: "manage", view: "setup" },
    { section: "registrations", label: "Student registration", icon: "admissions", access: "manage", view: "students" },
    { section: "teaching", label: "Teachers & schedules", icon: "calendar", access: "teach", view: "teaching" },
    { section: "attendance", label: "Subject attendance", icon: "applications", access: "teach", view: "attendance" },
    { section: "assessments", label: "Assessments & grades", icon: "awards", access: "teach", view: "assessments" },
    { section: "reports", label: "Results & reports", icon: "analytics", access: "manage", view: "reports" },
  ],
  TVET: [
    { section: "tvet-programs", label: "Programs & intakes", icon: "learning", access: "manage", view: "setup" },
    { section: "tvet-learners", label: "Learners & completion", icon: "admissions", access: "manage", view: "learners" },
    { section: "tvet-certificates", label: "Completion & certificates", icon: "awards", access: "manage", view: "certificates" },
    { section: "tvet-instructors", label: "Instructors & schedules", icon: "calendar", access: "teach", view: "training" },
    { section: "tvet-attendance", label: "Session attendance", icon: "applications", access: "teach", view: "attendance" },
    { section: "tvet-assessments", label: "Competency assessments", icon: "awards", access: "teach", view: "assessments" },
  ],
});
export const CAMPUS_MODULE_BY_SECTION = Object.freeze(Object.fromEntries(
  Object.entries(CAMPUS_MODULES).flatMap(([engine, modules]) =>
    modules.map(module => [module.section, { ...module, engine }]))
));
export function canAccessCampusModule(module, permissions = [], primaryAdmin = false) {
  if (!module) return false;
  if (primaryAdmin) return true;
  const grant = module.access === "manage"
    ? "organization.campus.academics.manage"
    : "organization.campus.teach";
  return permissions.includes(grant) || (module.access === "teach" && permissions.includes("organization.campus.academics.manage"));
}
