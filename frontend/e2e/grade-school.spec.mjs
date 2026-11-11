import { expect, test } from "@playwright/test";
import { backgroundMessaging } from "./support/background-messaging.mjs";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";
const organizationId = "55555555-5555-4555-8555-555555555555", accountId = "44444444-4444-4444-8444-444444444444";
const base = "/organization-workspace/" + organizationId, schoolPath = base + "/campus/grade-school";
async function fixture(page, role = "PRIMARY_ADMIN") {
  const permissions = role === "PRIMARY_ADMIN" ? ["organization.campus.academics.manage", "organization.campus.teach"] : ["organization.campus.teach"];
  const organization = { id: organizationId, name: "Synthetic Grade School", type: "SCHOOL", offersTraining: false, campus: { status: "ACTIVE", engine: "GRADE_SCHOOL", active: true } };
  const period = { id: "period", name: "Semester 1", year: { name: "2026–2027" } }, section = { id: "section", name: "A", schoolClass: { name: "Grade 10" } };
  const registration = { id: "registration", studentId: "student", status: "ACTIVE", version: 2, student: { id: "student", status: "ACTIVE", version: 2, account: { id: "learner", username: "synthetic_learner", fullName: "Synthetic Learner" } }, period, section };
  const offering = { id: "offering", periodId: "period", sectionId: "section", mode: "COMPULSORY", version: 2, subject: { id: "math", name: "Mathematics", passingMark: 50 }, section, period, teacherId: accountId, teacher: { username: "synthetic_teacher", fullName: "Synthetic Teacher" }, schedules: [] };
  const state = { errors: [], unexpected: [], submits: [], alerts: 0, academicReads: 0,
    attendance: { id: "attendance", heldOn: "2026-11-11", startsAt: 480, status: "DRAFT", version: 1, records: [] } };
  page.on("pageerror", e => state.errors.push(e.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
    if (url.origin !== "http://127.0.0.1:4187" || !path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: { success: status < 400, ...(status < 400 ? { data } : { message: data }) } });
    if (path === "/api/v1/my-campus") return reply({ items: role === "LEARNER" ? [{ id: "registration", campusId: organizationId, schoolName: organization.name, status: "PRE_REGISTERED", studentStatus: "PRE_REGISTERED", period: period.name, year: "2026–2027", section: "Grade 10 / A", message: "Welcome, Synthetic! Your registration has been confirmed by the school. Your Campus access is currently being finalized." }] : [] });
    const bg = backgroundMessaging(route); if (bg) return bg;
    if (path === "/api/v1/auth/me") return reply({ account: { id: accountId, username: "synthetic_teacher", person: { firstName: "Synthetic", lastName: "Teacher" } } });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === "/api/v1" + base) return reply({ accountId, organization, membership: { role, version: 1 }, permissions, staffVersion: 1, permissionCatalog: [], setupRequired: false, setup: { organization, required: false, version: 5, canEdit: true }, workspace: organizationWorkspace(organization, permissions, role) });
    if (path === "/api/v1" + base + "/campus") return reply({ organizationId, eligible: true, eligibility: { eligible: true, verifiedOrganization: true, verifiedLiberiaOperation: true, productEnabled: true, supportedEngines: ["GRADE_SCHOOL"], reasons: [] }, campus: { engine: "GRADE_SCHOOL", status: "ACTIVE", storedStatus: "ACTIVE", version: 2, displayName: organization.name, contactEmail: null }, permissions, canSetup: role === "PRIMARY_ADMIN", canManage: role === "PRIMARY_ADMIN", canAnnounce: role === "PRIMARY_ADMIN" });
    if (path === "/api/v1" + base + "/campus/announcements") return reply({ items: [], nextCursor: null });
    if (path === "/api/v1" + schoolPath) { state.academicReads++; return reply({ campusId: organizationId, displayName: organization.name, canManage: role === "PRIMARY_ADMIN", periodId: "period", subjects: [offering.subject], classes: [{ id: "class", name: "Grade 10", sections: [section] }], years: [{ id: "year", name: "2026–2027", periods: [period] }], offerings: [offering] }); }
    if (path === "/api/v1" + schoolPath + "/offerings/offering") return reply({ offering, students: [registration], attendance: [state.attendance], assessments: [] });
    if (path === "/api/v1" + schoolPath + "/attendance/attendance" && method === "PUT") {
      const body = route.request().postDataJSON(); state.submits.push(body);
      if (body.expectedVersion !== state.attendance.version || state.attendance.status === "FINAL") return reply("Changed", 409);
      state.attendance = { ...state.attendance, records: body.records, version: state.attendance.version + 1, status: body.finalize ? "FINAL" : "DRAFT" };
      if (body.finalize) state.alerts++; return reply(state.attendance);
    }
    state.unexpected.push(method + " " + path); return reply("Unexpected synthetic request", 500);
  });
  return state;
}
const layout = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
test("Grade School staff save subject attendance as draft, then finalize a complete register once", async ({ page }) => {
  const state = await fixture(page); await page.goto(base + "/campus");
  await expect(page.getByRole("button", { name: "Academic setup", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Teaching & attendance", exact: true }).click(); await page.getByRole("button", { name: "Edit attendance", exact: true }).click();
  await page.getByRole("button", { name: "Submit final attendance", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Complete every student's record"); expect(state.submits).toHaveLength(0);
  await page.getByLabel("Attendance for Synthetic Learner").selectOption("ABSENT"); await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. Student results and guardian alerts remain unpublished.", { exact: true })).toBeVisible(); expect(state.alerts).toBe(0);
  await page.getByRole("button", { name: "Edit attendance", exact: true }).click(); await page.getByRole("button", { name: "Submit final attendance", exact: true }).click();
  await expect(page.getByText("Attendance finalized. Applicable guardian absence alerts have been sent.", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Edit attendance", exact: true })).toHaveCount(0);
  expect(state.alerts).toBe(1); expect(state.submits.map(r => r.finalize)).toEqual([false, true]); await layout(page); expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]);
});
test("assigned teachers use organization Campus without academic setup or student administration", async ({ page }) => {
  const state = await fixture(page, "STAFF"); await page.goto(base + "/campus");
  await expect(page.getByRole("heading", { name: "Subject attendance", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Academic setup", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Students & guardians", exact: true })).toHaveCount(0); await expect(page.getByLabel("Teacher username", { exact: true })).toHaveCount(0);
  await layout(page); expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]);
});
test("pre-registered learners see the agreed waiting flow without making academic reads", async ({ page }) => {
  const state = await fixture(page, "LEARNER"); await page.goto("/learning?view=campus");
  await expect(page.getByText(/Welcome, Synthetic!/)).toBeVisible(); await expect(page.getByRole("link", { name: "Come Later", exact: true })).toHaveAttribute("href", "/explore");
  await expect(page.getByRole("button", { name: "Open my Campus", exact: true })).toHaveCount(0); expect(state.academicReads).toBe(0); await layout(page); expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]);
});
