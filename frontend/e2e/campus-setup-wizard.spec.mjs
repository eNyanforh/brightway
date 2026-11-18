import { expect, test } from "@playwright/test";
import { backgroundMessaging } from "./support/background-messaging.mjs";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";

const organizationId = "55555555-5555-4555-8555-555555555555";
const accountId = "44444444-4444-4444-8444-444444444444";
const work = "/organization-workspace/" + organizationId;
const root = "/api/v1" + work + "/campus";
const campusUrl = "/campus/" + organizationId;

function fixture() {
  let campus = null, counter = 0;
  const requests = [], unexpected = [];
  const uuid = () => "00000000-0000-4000-8000-" + String(++counter).padStart(12, "0");
  const organization = { id: organizationId, name: "Liberia Test Institution", type: "SCHOOL", offersTraining: true };
  const school = { subjects: [], classes: [], years: [], offerings: [] };
  const training = { programs: [], intakes: [], assignments: [] };
  const permissions = () => campus?.status === "ACTIVE" ?
    ["organization.campus.manage", "organization.campus.academics.manage", "organization.campus.teach"] : [];
  const info = () => ({
    organizationId, campus, eligible: true, canManage: true, canSetup: true, canAnnounce: Boolean(campus?.status === "ACTIVE"),
    permissions: permissions(),
    eligibility: { eligible: true, verifiedOrganization: true, verifiedLiberiaOperation: true,
      productEnabled: true, supportedEngines: ["GRADE_SCHOOL", "TVET"], reasons: [] },
  });
  const context = () => ({
    accountId, organization, membership: { role: "PRIMARY_ADMIN", version: 1 }, staffVersion: 1,
    permissions: permissions(), permissionCatalog: [], setupRequired: false,
    setup: { organization, required: false, version: 5, canEdit: true },
    workspace: organizationWorkspace(organization, permissions(), "PRIMARY_ADMIN"),
  });
  async function serve(route) {
    const msg = backgroundMessaging(route);
    if (msg) return msg;
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== "http://127.0.0.1:4187" || !path.startsWith("/api/")) return route.continue();
    const method = request.method(), body = method === "GET" ? null : request.postDataJSON();
    const reply = (data, status = 200) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data } });
    if (path === "/api/v1/auth/me") return reply({ account: { id: accountId, username: "school_admin", person: { firstName: "Campus", lastName: "Admin" } } });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === "/api/v1/my-campus" && method === "GET") return reply({ items: [] });
    if (path === "/api/v1/my-workspace" && method === "GET")
      return reply({ tab: "approved", search: "", counts: { approved: 1, pending: 0, invitations: 0, history: 0 },
        items: [{ ...organization, role: "PRIMARY_ADMIN" }], nextCursor: null });
    if (path === "/api/v1" + work) return reply(context());
    if (path === root && method === "GET") return reply(info());
    if (path === root + "/setup" && method === "PUT") {
      requests.push({ action: "campus.setup", body });
      campus = { ...body, version: 1, status: "SETUP", storedStatus: "SETUP" };
      return reply(campus);
    }
    if (path === root + "/activate" && method === "POST") {
      requests.push({ action: "campus.activate", body });
      if (campus?.status !== "SETUP" || body.expectedVersion !== 1) return reply("Wrong version", 409);
      campus = { ...campus, version: 2, status: "ACTIVE", storedStatus: "ACTIVE" };
      return reply(campus);
    }
    if (path === root + "/grade-school" && method === "GET") {
      const periodId = url.searchParams.get("periodId") || school.years.flatMap(y => y.periods)[0]?.id || null;
      return reply({ campusId: organizationId, displayName: organization.name, canManage: true, periodId,
        ...school, offerings: school.offerings.filter(o => o.periodId === periodId) });
    }
    if (path.startsWith(root + "/grade-school/") && method === "POST") {
      const kind = path.slice((root + "/grade-school/").length);
      if (kind === "subjects") {
        const row = { id: uuid(), ...body }; school.subjects.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "classes") {
        const row = { id: uuid(), name: body.name, sections: [] }; school.classes.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "sections") {
        const klass = school.classes.find(c => c.id === body.classId); if (!klass) return reply("Invalid class", 400);
        const row = { id: uuid(), ...body }; klass.sections.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "years") {
        const row = { id: uuid(), ...body, periods: [] }; school.years.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "periods") {
        const year = school.years.find(y => y.id === body.yearId); if (!year) return reply("Invalid year", 400);
        const row = { id: uuid(), ...body }; year.periods.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "offerings") {
        const subject = school.subjects.find(s => s.id === body.subjectId);
        const klass = school.classes.find(c => c.sections.some(s => s.id === body.sectionId));
        const section = klass?.sections.find(s => s.id === body.sectionId);
        const row = { id: uuid(), ...body, version: 1, teacherId: null, teacher: null, subject,
          section: { ...section, schoolClass: { id: klass?.id, name: klass?.name } }, period: school.years.flatMap(y => y.periods).find(p => p.id === body.periodId), schedules: [] };
        school.offerings.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
    }
    if (path.includes("/grade-school/offerings/") && path.endsWith("/teacher") && method === "PUT") {
      const key = path.split("/").at(-2), row = school.offerings.find(o => o.id === key);
      if (!row || row.version !== body.expectedVersion) return reply("Offering changed", 409);
      row.version++; row.teacherId = uuid(); row.teacher = { id: row.teacherId, username: body.username, fullName: "Approved Teacher" };
      requests.push({ action: "teacher", body }); return reply({ id: row.id, version: row.version });
    }
    if (path === root + "/tvet" && method === "GET") {
      const intakeId = url.searchParams.get("intakeId") || training.intakes[0]?.id || null;
      return reply({ campusId: organizationId, displayName: organization.name, canManage: true,
        intakeId, ...training, assignments: training.assignments.filter(item => item.intakeId === intakeId), discoverPrograms: [] });
    }
    if (path.startsWith(root + "/tvet/") && method === "POST") {
      const kind = path.slice((root + "/tvet/").length);
      if (kind === "programs") {
        const row = { id: uuid(), ...body, modules: [] }; training.programs.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "intakes") {
        const program = training.programs.find(p => p.id === body.programId);
        const row = { id: uuid(), ...body, program, sections: [], version: 1, startedAt: null };
        training.intakes.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "sections") {
        const intake = training.intakes.find(t => t.id === body.intakeId);
        const row = { id: uuid(), ...body }; intake.sections.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "modules") {
        const program = training.programs.find(p => p.id === body.programId);
        const row = { id: uuid(), ...body }; program.modules.push(row); requests.push({ action: kind, body }); return reply(row, 201);
      }
      if (kind === "assignments") {
        const row = { id: uuid(), ...body, instructor: { fullName: "Approved Instructor" },
          section: training.intakes.flatMap(t => t.sections).find(s => s.id === body.sectionId) || null,
          module: training.programs.flatMap(p => p.modules).find(m => m.id === body.moduleId) || null };
        training.assignments.push(row); requests.push({ action: "instructor", body }); return reply(row, 201);
      }
    }
    unexpected.push(method + " " + path);
    return reply("Unexpected Campus API request", 500);
  }
  return { serve, requests, unexpected };
}

test("first modal creates persistent Grade School subjects, sections, periods, offerings and teacher assignment", async ({ page }) => {
  const f = fixture();
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/*", f.serve);
  await page.goto(campusUrl);
  const dialog = page.getByRole("dialog", { name: /Set up your school Campus/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Academic engine")).toHaveValue("GRADE_SCHOOL");
  await dialog.getByRole("button", { name: "Save Campus setup" }).click();
  await expect(dialog.getByRole("button", { name: "Activate Campus" })).toBeVisible();
  await expect(f.requests.map(r => r.action)).toEqual(["campus.setup"]);
  await dialog.getByRole("button", { name: "Activate Campus" }).click();

  await expect(dialog.getByRole("heading", { name: "1. Subjects & courses" })).toBeVisible();
  await dialog.getByRole("form", { name: "Add a subject" }).getByLabel("Subject name").fill("Mathematics");
  await dialog.getByRole("form", { name: "Add a subject" }).getByRole("button", { name: "Add subject" }).click();
  await expect(dialog.getByText("Passing mark: 50%")).toBeVisible();
  await dialog.getByRole("button", { name: "Next step" }).click();

  await dialog.getByRole("form", { name: "Add a class level" }).getByLabel("Class level").fill("Grade 10");
  await dialog.getByRole("form", { name: "Add a class level" }).getByRole("button", { name: "Add class" }).click();
  const section = dialog.getByRole("form", { name: "Add a class section" });
  await section.getByLabel("Class level").selectOption({ label: "Grade 10" });
  await section.getByLabel("Section name").fill("A");
  await section.getByRole("button", { name: "Add section" }).click();
  await expect(dialog.getByText("40 student seats")).toBeVisible();
  await dialog.getByRole("button", { name: "Next step" }).click();

  const year = dialog.getByRole("form", { name: "Add an academic year" });
  await year.getByLabel("Academic year").fill("2027–2028");
  await year.getByLabel("Start date").fill("2027-09-01");
  await year.getByLabel("End date").fill("2028-06-30");
  await year.getByRole("button", { name: "Add academic year" }).click();
  const period = dialog.getByRole("form", { name: "Add an academic period" });
  await period.getByLabel("Academic year").selectOption({ label: "2027–2028" });
  await period.getByLabel("Period name").fill("Semester 1");
  await period.getByLabel("Period start").fill("2027-09-01");
  await period.getByLabel("Period end").fill("2028-01-31");
  await period.getByRole("button", { name: "Add term or semester" }).click();
  await dialog.getByRole("button", { name: "Next step" }).click();

  const offer = dialog.getByRole("form", { name: "Offer a subject" });
  await offer.getByLabel("Class / section").selectOption({ label: "Grade 10 / A" });
  await offer.getByLabel("Subject").selectOption({ label: "Mathematics" });
  await offer.getByRole("button", { name: "Offer subject" }).click();
  const assign = dialog.getByRole("form", { name: "Assign a teacher" });
  await assign.getByLabel("Subject offering").selectOption({ index: 1 });
  await assign.getByLabel("Teacher's BrightWay username").fill("teacher_one");
  await assign.getByRole("button", { name: "Assign teacher" }).click();
  await expect(dialog.getByText("Teacher: @teacher_one")).toBeVisible();
  await dialog.getByRole("button", { name: "Finish Campus setup" }).click();
  await expect(page).toHaveURL(campusUrl + "/school-setup");
  expect(f.requests.map(r => r.action)).toEqual(["campus.setup", "campus.activate", "subjects", "classes", "sections", "years", "periods", "offerings", "teacher"]);
  expect(f.unexpected).toEqual([]); expect(pageErrors).toEqual([]);
});

test("first modal sets up TVET programs, intakes, sections, modules and instructor scopes independently", async ({ page }) => {
  const f = fixture();
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/*", f.serve);
  await page.goto(campusUrl);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Academic engine").selectOption("TVET");
  await dialog.getByRole("button", { name: "Save Campus setup" }).click();
  await dialog.getByRole("button", { name: "Activate Campus" }).click();
  await expect(dialog.getByRole("heading", { name: "1. Programs & trades" })).toBeVisible();
  const programs = dialog.getByRole("form", { name: "Add a training program" });
  await programs.getByLabel("Program / trade").fill("Automotive Mechanics");
  await programs.getByRole("button", { name: "Add program" }).click();
  await dialog.getByRole("button", { name: "Next step" }).click();

  const intake = dialog.getByRole("form", { name: "Add an intake" });
  await intake.getByLabel("Training program").selectOption({ label: "Automotive Mechanics" });
  await intake.getByLabel("Intake name").fill("January 2027");
  await intake.getByLabel("Start date").fill("2027-01-04");
  await intake.getByLabel("End date").fill("2027-06-30");
  await intake.getByRole("button", { name: "Add intake" }).click();
  await dialog.getByRole("button", { name: "Next step" }).click();

  const section = dialog.getByRole("form", { name: "Add a training section" });
  await section.getByLabel("Section name").fill("Workshop A");
  await section.getByRole("button", { name: "Add training section" }).click();
  const module = dialog.getByRole("form", { name: "Add an optional or required module" });
  await module.getByLabel("Module name").fill("Engine Systems");
  await module.getByRole("button", { name: "Add module" }).click();
  await dialog.getByRole("button", { name: "Next step" }).click();

  const instructor = dialog.getByRole("form", { name: "Assign a TVET instructor" });
  await instructor.getByLabel("Training section").selectOption({ label: "Workshop A" });
  await instructor.getByLabel("Training module").selectOption({ label: "Engine Systems" });
  await instructor.getByLabel("Instructor's BrightWay username").fill("instructor_one");
  await instructor.getByRole("button", { name: "Assign instructor" }).click();
  await expect(dialog.getByText("Approved Instructor")).toBeVisible();
  await dialog.getByRole("button", { name: "Finish Campus setup" }).click();
  await expect(page).toHaveURL(campusUrl + "/tvet-programs");
  expect(f.requests.map(r => r.action)).toEqual(["campus.setup", "campus.activate", "programs", "intakes", "sections", "modules", "instructor"]);
  expect(f.unexpected).toEqual([]); expect(pageErrors).toEqual([]);
});

test("approved school primary administrator opens the first Campus setup modal from My Workspace", async ({ page }) => {
  const f = fixture();
  await page.route("**/*", f.serve);
  await page.goto("/work");
  const entry = page.getByRole("link", { name: "Manage", exact: true });
  await expect(entry).toHaveAttribute("href", campusUrl);
  await entry.click();
  await expect(page).toHaveURL(campusUrl);
  await expect(page.getByRole("dialog", { name: /Set up your school Campus/ })).toBeVisible();
  expect(f.unexpected).toEqual([]);
});
