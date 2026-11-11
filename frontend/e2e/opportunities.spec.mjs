import { backgroundMessaging } from "./support/background-messaging.mjs";
import { expect, test } from "@playwright/test";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";
const origin = "http://127.0.0.1:4187";
const oid = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333", aid = "55555555-5555-4555-8555-555555555555", qid = "44444444-4444-4444-8444-444444444444";
const organization = { id: oid, name: "Synthetic Research Institute", type: "COMPANY", offersTraining: false };
const permissions = ["organization.opportunities.manage", "organization.applications.review"];
const base = "/organization-workspace/" + oid;
const initialOpportunity = { id, organization, organizationId: oid, type: "JOB", title: "Community research assistant", description: "Join a research team and help improve education outcomes across communities.", location: "Monrovia, Liberia", workMode: "IN_PERSON", deadline: "2099-12-01T12:00:00Z", status: "PUBLISHED", publishedAt: "2026-11-11T12:00:00Z", version: 2, questions: [{ id: qid, type: "YES_NO", label: "Can you join our team?", required: true, options: [] }], createdAt: "2026-11-11T12:00:00Z" };
async function fixture(page) {
  const state = { opportunity: structuredClone(initialOpportunity), application: null, drafts: [], errors: [], calls: [] };
  page.on("pageerror", e => state.errors.push(e.message));
  await page.route("**/*", async route => {
    // Background channels are independent of this journey; SSE behavior has its own HTTP test.
    const background = backgroundMessaging(route); if (background) return background;
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== origin) return route.abort();
    if (!path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, message: data } });
    state.calls.push(path);
    if (path === "/api/v1/auth/me") return reply({ account: { id: "11111111-1111-4111-8111-111111111111", username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } } });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === "/api/v1" + base) return reply({ accountId: "11111111-1111-4111-8111-111111111111", organization, permissions, membership: { role: "PRIMARY_ADMIN" }, staffVersion: 1, permissionCatalog: [], workspace: organizationWorkspace(organization, permissions, "PRIMARY_ADMIN"), setup: { organization, required: false, canEdit: true, version: 5 } });
    if (path === "/api/v1/opportunities") return reply({ items: [state.opportunity, ...["SCHOLARSHIP", "CHALLENGE", "EVENT"].map((type, i) => ({ ...state.opportunity, id: `${id.slice(0,-1)}${i}`, type, title: ["Student scholarship", "Community innovation challenge", "Research open day"][i] }))].filter(o => !url.searchParams.get("type") || o.type === url.searchParams.get("type")), nextCursor: null });
    if (path === "/api/v1/opportunities/" + id) return reply({ opportunity: state.opportunity, application: state.application && { id: aid } });
    if (path === "/api/v1/opportunities/" + id + "/application") {
      const body = request.postDataJSON();
      state.application = { id: aid, opportunity: state.opportunity, status: body.action === "SUBMIT" ? "SUBMITTED" : "DRAFT", version: (state.application?.version || 0) + 1, answers: body.answers, files: [], events: [], createdAt: "2026-11-11T12:00:00Z", ...(body.action === "SUBMIT" ? { submittedAt: "2026-11-11T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", headline: "Data analyst", location: {}, skills: ["Data"], interests: ["Education"], credentials: [] }, opportunitySnapshot: { title: state.opportunity.title, organization: organization.name, questions: state.opportunity.questions }, events: [{ id: "submitted", toStatus: "SUBMITTED", createdAt: "2026-11-11T12:00:00Z" }] } : {}) };
      return reply(state.application);
    }
    if (path === "/api/v1/applications/me") return reply({ items: state.application ? [state.application] : [], nextCursor: null });
    if (path === "/api/v1/applications/me/" + aid) return reply(state.application);
    if (path === "/api/v1/applications/me/" + aid + "/withdraw") { state.application.status = "WITHDRAWN"; return reply(state.application); }
    if (path === "/api/v1" + base + "/opportunities") {
      if (request.method() === "POST") { const body = request.postDataJSON(); const row = { ...body, id: "66666666-6666-4666-8666-666666666666", organization, version: 1, status: "DRAFT" }; state.drafts.push(row); return reply(row, 201); }
      return reply({ items: state.drafts, nextCursor: null });
    }
    if (path.endsWith("/status") && path.includes("/opportunities/")) { const row = state.drafts[0]; row.status = request.postDataJSON().status; row.version++; return reply(row); }
    if (path === "/api/v1" + base + "/applications") return reply({ items: state.application ? [state.application] : [], nextCursor: null });
    if (path === "/api/v1" + base + "/applications/" + aid) return reply({ ...state.application, canReview: true });
    if (path === "/api/v1" + base + "/applications/" + aid + "/status") { const body = request.postDataJSON(); state.application = { ...state.application, status: body.status, feedback: body.feedback, version: state.application.version + 1, canReview: true, events: [...state.application.events, { id: "decision", toStatus: body.status, feedback: body.feedback, createdAt: "2026-11-11T13:00:00Z" }] }; return reply(state.application); }
    if (path === "/api/v1/notifications") return reply({ items: state.application?.feedback ? [{ id: qid, kind: "APPLICATION_STATUS", createdAt: "2026-11-11T13:00:00Z", readAt: null, application: { id: aid, title: state.opportunity.title, status: state.application.status } }] : [], nextCursor: null });
    if (path === "/api/v1/search" || path === "/api/v1/search/content") return reply({ items: [], nextCursor: null });
    return reply("Unexpected synthetic request: " + path, 500);
  });
  return state;
}
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
test("members discover four opportunity types, save and submit an application, and withdraw", async ({ page }, testInfo) => {
  const state = await fixture(page);
  await page.goto("/opportunities");
  await expect(page.getByRole("link", { name: initialOpportunity.title })).toBeVisible();
  await expect(page.locator(".bw-op-card")).toHaveCount(4); await noOverflow(page);
  await page.screenshot({ path: `/tmp/brightway-opportunities-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("link", { name: initialOpportunity.title }).click();
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
  state.application = { id: aid, opportunity: state.opportunity, status: "SUBMITTED", version: 1, answers: { [qid]: false }, files: [], events: [], submittedAt: "2026-11-11T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", headline: "Data analyst", location: {}, skills: ["Data"], interests: ["Education"], credentials: [] }, opportunitySnapshot: { title: state.opportunity.title, organization: organization.name, questions: state.opportunity.questions } };
  await page.goto(base + "/opportunities");
  await page.getByRole("button", { name: "+ Create opportunity" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Title", { exact: true }).fill("Data internship"); await editor.getByLabel("Description", { exact: true }).fill("Build skills in field research, data quality, and community engagement.");
  await editor.getByLabel("Location", { exact: true }).fill("Monrovia"); await editor.getByLabel("Application deadline (your local time)").fill("2099-12-01T12:00");
  await editor.getByRole("button", { name: "+ Add question" }).click(); await editor.getByLabel("Question 1 text").fill("Why would you like to join?");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(editor).toHaveCount(0);
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Publish", exact: true }).click(); await expect(page.locator(".bw-op-managed-card")).toContainText("Published");
  await noOverflow(page); await page.goto(base + "/applications");
  await page.getByRole("button", { name: /Synthetic Applicant/ }).click();
  await page.getByRole("combobox", { name: "Decision", exact: true }).selectOption("SHORTLISTED"); await page.getByLabel("Message to applicant").fill("Please prepare for an interview.");
  await page.getByRole("button", { name: "Save decision" }).click(); await expect(page.getByRole("heading", { name: "Application timeline" })).toBeVisible();
  await page.screenshot({ path: `/tmp/brightway-applications-${testInfo.project.name}.png`, fullPage: true }); await noOverflow(page);
  await page.goto("/notifications"); await expect(page.getByRole("link", { name: initialOpportunity.title })).toBeVisible();
  await page.getByRole("button", { name: "Unread", exact: true }).click(); await expect(page.getByRole("link", { name: initialOpportunity.title })).toBeVisible(); expect(state.errors).toEqual([]);
});
