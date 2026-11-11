import { expect, test } from "@playwright/test";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";
const origin = "http://127.0.0.1:4187";
const oid = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333", aid = "55555555-5555-4555-8555-555555555555", qid = "44444444-4444-4444-8444-444444444444";
const organization = { id: oid, name: "Synthetic Research Institute", type: "COMPANY", offersTraining: true };
const permissions = ["organization.programs.manage", "organization.admissions.review"];
const base = "/organization-workspace/" + oid;
const program = { id: "77777777-7777-4777-8777-777777777777", organization, title: "Data science certificate", description: "Learn to improve education and community research with practical data skills.", type: "CERTIFICATE", duration: "6 months", field: "Data science", studyMode: "ONLINE", countryCode: "GH", location: "Accra", requirements: "Basic computer literacy", status: "PUBLISHED", version: 2 };
const initialOpportunity = { program, opensAt: "2026-01-01T00:00:00Z", id, organization, organizationId: oid, type: "JOB", title: "Community research assistant", description: "Join a research team and help improve education outcomes across communities.", location: "Monrovia, Liberia", workMode: "IN_PERSON", deadline: "2099-12-01T12:00:00Z", status: "OPEN", publishedAt: "2026-11-11T12:00:00Z", version: 2, questions: [{ id: qid, type: "YES_NO", label: "Can you join our team?", required: true, options: [] }], createdAt: "2026-11-11T12:00:00Z" };
async function fixture(page) {
  const state = { cycle: structuredClone(initialOpportunity), application: null, drafts: [], programs: [], errors: [], calls: [] };
  page.on("pageerror", e => state.errors.push(e.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== origin) return route.abort();
    if (!path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, message: data } });
    state.calls.push(path);
    if (path === "/api/v1/auth/me") return reply({ account: { id: "11111111-1111-4111-8111-111111111111", username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } } });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === "/api/v1" + base) return reply({ accountId: "11111111-1111-4111-8111-111111111111", organization, permissions, membership: { role: "PRIMARY_ADMIN" }, staffVersion: 1, permissionCatalog: [], workspace: organizationWorkspace(organization, permissions, "PRIMARY_ADMIN"), setup: { organization, required: false, canEdit: true, version: 5 } });
    if (path === "/api/v1/learning/discover") return reply({ items: url.searchParams.get("kind") === "admissions" ? [state.cycle] : url.searchParams.get("kind") === "institutions" ? [{ ...organization, request: { countryCode: "GH", city: "Accra" } }] : [program], nextCursor: null });
    if (path === "/api/v1/learning/programs/" + program.id) return reply({ program, cycles: [state.cycle] });
    if (path === "/api/v1" + base + "/programs") {
      if (request.method() === "POST") { const row = { ...request.postDataJSON(), id: program.id, organization, version: 1, status: "DRAFT" }; state.programs.push(row); return reply(row, 201); }
      return reply({ items: state.programs, nextCursor: null });
    }
    if (path === "/api/v1" + base + "/programs/" + program.id + "/status") { const row = state.programs[0]; row.status = request.postDataJSON().status; row.version++; return reply(row); }
    if (path === "/api/v1/admission-cycles/" + id) return reply({ cycle: state.cycle, application: state.application && { id: aid } });
    if (path === "/api/v1/admission-cycles/" + id + "/application") {
      const body = request.postDataJSON();
      state.application = { id: aid, cycle: state.cycle, status: body.action === "SUBMIT" ? "SUBMITTED" : "DRAFT", version: (state.application?.version || 0) + 1, answers: body.answers, files: [], events: [], createdAt: "2026-11-11T12:00:00Z", ...(body.action === "SUBMIT" ? { submittedAt: "2026-11-11T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", headline: "Data analyst", location: {}, skills: ["Data"], interests: ["Education"], credentials: [] }, cycleSnapshot: { title: state.cycle.title, organization: organization.name, questions: state.cycle.questions }, events: [{ id: "submitted", toStatus: "SUBMITTED", createdAt: "2026-11-11T12:00:00Z" }] } : {}) };
      return reply(state.application);
    }
    if (path === "/api/v1/admission-applications/me") return reply({ items: state.application ? [state.application] : [], nextCursor: null });
    if (path === "/api/v1/admission-applications/me/" + aid) return reply(state.application);
    if (path === "/api/v1/admission-applications/me/" + aid + "/withdraw") { state.application.status = "WITHDRAWN"; return reply(state.application); }
    if (path === "/api/v1" + base + "/admission-cycles") {
      if (request.method() === "POST") { const body = request.postDataJSON(); const row = { ...body, program: state.programs[0], id: "66666666-6666-4666-8666-666666666666", organization, version: 1, status: "DRAFT" }; state.drafts.push(row); return reply(row, 201); }
      return reply({ items: state.drafts, nextCursor: null });
    }
    if (path.endsWith("/status") && path.includes("/admission-cycles/")) { const row = state.drafts[0]; row.status = request.postDataJSON().status; row.version++; return reply(row); }
    if (path === "/api/v1" + base + "/admission-applications") return reply({ items: state.application ? [state.application] : [], nextCursor: null });
    if (path === "/api/v1" + base + "/admission-applications/" + aid) return reply({ ...state.application, canReview: true });
    if (path === "/api/v1" + base + "/admission-applications/" + aid + "/status") { const body = request.postDataJSON(); state.application = { ...state.application, status: body.status, feedback: body.feedback, version: state.application.version + 1, canReview: true, events: [...state.application.events, { id: "decision", toStatus: body.status, feedback: body.feedback, createdAt: "2026-11-11T13:00:00Z" }] }; return reply(state.application); }
    if (path === "/api/v1/notifications") return reply({ items: state.application?.feedback ? [{ id: qid, kind: "ADMISSION_STATUS", createdAt: "2026-11-11T13:00:00Z", readAt: null, application: { id: aid, title: state.cycle.title, status: state.application.status } }] : [], nextCursor: null });
    if (path === "/api/v1/search" || path === "/api/v1/search/content") return reply({ items: [], nextCursor: null });
    return reply("Unexpected synthetic request: " + path, 500);
  });
  return state;
}
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
test("learners discover a global program, choose an intake, save, submit and withdraw an admission application", async ({ page }, testInfo) => {
  const state = await fixture(page);
  await page.goto("/learning");
  await expect(page.getByRole("link", { name: program.title })).toBeVisible();
  await page.getByRole("combobox", { name: "Country", exact: true }).selectOption("GH"); await page.getByRole("search", { name: "Discover education" }).getByRole("button", { name: "Search", exact: true }).click(); await noOverflow(page);
  await page.screenshot({ path: `/tmp/brightway-learning-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("link", { name: program.title }).click();
  await page.getByRole("link", { name: "View & apply →" }).click();
  await page.getByLabel("Can you join our team?").selectOption("false");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application timeline" })).toBeVisible();
  expect(state.application.answers[qid]).toBe(false);
  await page.getByRole("button", { name: "Withdraw application", exact: true }).click(); await page.getByRole("button", { name: "Confirm withdrawal" }).click();
  await expect(page.locator(".bw-op-section-title")).toContainText("Withdrawn"); await noOverflow(page); expect(state.errors).toEqual([]);
});
test("organization publishers create and publish a form, and reviewers send an applicant decision", async ({ page }, testInfo) => {
  const state = await fixture(page);
  state.application = { id: aid, cycle: state.cycle, status: "SUBMITTED", version: 1, answers: { [qid]: false }, files: [], events: [], submittedAt: "2026-11-11T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", headline: "Data analyst", location: {}, skills: ["Data"], interests: ["Education"], credentials: [] }, cycleSnapshot: { title: state.cycle.title, organization: organization.name, questions: state.cycle.questions } };
  await page.goto(base + "/programs");
  await page.getByRole("button", { name: "+ Create program" }).click();
  let editor = page.getByRole("dialog");
  await editor.getByLabel("Program name").fill(program.title); await editor.getByLabel("Description", { exact: true }).fill(program.description);
  await editor.getByLabel("Duration").fill(program.duration); await editor.getByLabel("Field of study").fill(program.field);
  await editor.getByRole("combobox", { name: "Country", exact: true }).selectOption("GH"); await editor.getByLabel("City or location").fill("Accra"); await editor.getByLabel("Entry requirements").fill(program.requirements);
  await editor.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Publish program", exact: true }).click();
  await page.getByRole("button", { name: "+ Add admission cycle" }).click(); editor = page.getByRole("dialog");
  await editor.getByLabel("Intake or cycle name").fill("January intake");
  await editor.getByLabel("Applications open (your local time)").fill("2026-01-01T12:00"); await editor.getByLabel("Application deadline (your local time)").fill("2099-12-01T12:00");
  await editor.getByRole("button", { name: "+ Add question" }).click(); await editor.getByLabel("Question 1 text").fill("Why would you like to join?");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Publish cycle", exact: true }).click(); await expect(page.locator(".bw-op-managed-card").last()).toContainText("Open");
  await noOverflow(page); await page.goto(base + "/admissions");
  await page.getByRole("button", { name: /Synthetic Applicant/ }).click();
  await page.getByRole("combobox", { name: "Decision", exact: true }).selectOption("WAITLISTED"); await page.getByLabel("Message to applicant").fill("Please prepare for an interview.");
  await page.getByRole("button", { name: "Save decision" }).click(); await expect(page.getByRole("heading", { name: "Application timeline" })).toBeVisible();
  await page.screenshot({ path: `/tmp/brightway-admissions-${testInfo.project.name}.png`, fullPage: true }); await noOverflow(page);
  await page.goto("/notifications"); await expect(page.getByRole("link", { name: initialOpportunity.title })).toBeVisible();
  await page.getByRole("button", { name: "Unread", exact: true }).click(); await expect(page.getByRole("link", { name: initialOpportunity.title })).toBeVisible(); expect(state.errors).toEqual([]);
});
