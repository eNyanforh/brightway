import { test, expect } from "@playwright/test";
import { backgroundMessaging } from "./support/background-messaging.mjs";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";

const organizationId = "55555555-5555-4555-8555-555555555555";
const workspacePath = "/organization-workspace/" + organizationId;
const campusPath = workspacePath + "/campus";
const accountId = "44444444-4444-4444-8444-444444444444";
const org = { id: organizationId, name: "Synthetic Liberia Academy", type: "SCHOOL", offersTraining: true };

function fixture(eligible = true) {
  let campus = null, announcements = [], requests = [], errors = [];
  const context = { accountId, organization: org, membership: { role: "PRIMARY_ADMIN", version: 1 },
    permissions: ["organization.members.manage"], staffVersion: 1, permissionCatalog: [],
    setupRequired: false, setup: { organization: org, required: false, version: 5, canEdit: true },
    workspace: organizationWorkspace(org, ["organization.members.manage"], "PRIMARY_ADMIN") };
  const current = () => ({
    organizationId, eligible,
    eligibility: { eligible, verifiedOrganization: true, verifiedLiberiaOperation: eligible,
      productEnabled: true, supportedEngines: ["GRADE_SCHOOL", "TVET"],
      reasons: eligible ? [] : ["A verified operating location in Liberia is required."] },
    campus, canSetup: eligible, canManage: true, canAnnounce: campus?.status === "ACTIVE",
    permissions: campus?.status === "ACTIVE" ? ["organization.campus.manage", "organization.campus.announcements.manage"] : [],
  });
  const serve = async route => {
    const bg = backgroundMessaging(route); if (bg) return bg;
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4187") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname, method = route.request().method();
    const reply = (data, status = 200) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data } });
    if (path === "/api/v1/auth/me") return reply({ account: { id: accountId, username: "campus_owner", person: { firstName: "Campus", lastName: "Owner" } } });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === "/api/v1" + workspacePath && method === "GET") return reply(context);
    if (path === "/api/v1" + campusPath && method === "GET") return reply(current());
    if (path === "/api/v1" + campusPath + "/setup" && method === "PUT") {
      const body = route.request().postDataJSON(); requests.push({ action: "setup", body });
      if (campus || !eligible || body.expectedVersion !== 0) return reply("Campus has changed.", 409);
      campus = { engine: body.engine, status: "SETUP", storedStatus: "SETUP", version: 1,
        displayName: body.displayName, contactEmail: body.contactEmail, activatedAt: null }; return reply({ version: 1, status: "SETUP", engine: campus.engine });
    }
    if (path === "/api/v1" + campusPath + "/activate" && method === "POST") {
      const body = route.request().postDataJSON(); requests.push({ action: "activate", body });
      if (!campus || campus.version !== body.expectedVersion || campus.status !== "SETUP") return reply("Campus changed.", 409);
      campus = { ...campus, version: 2, status: "ACTIVE", storedStatus: "ACTIVE", activatedAt: new Date().toISOString() };
      return reply({ version: 2, status: "ACTIVE" });
    }
    if (path === "/api/v1" + campusPath + "/pause" && method === "POST") {
      const body = route.request().postDataJSON(); requests.push({ action: "pause", body });
      if (!campus || body.expectedVersion !== campus.version) return reply("Campus changed.", 409);
      campus = { ...campus, version: 3, status: "PAUSED", storedStatus: "PAUSED" }; return reply({ status: "PAUSED", version: 3 });
    }
    if (path === "/api/v1" + campusPath + "/announcements" && method === "GET")
      return reply({ organizationId, items: announcements, nextCursor: null });
    if (path === "/api/v1" + campusPath + "/announcements" && method === "POST") {
      const body = route.request().postDataJSON(); requests.push({ action: "publish", body });
      const item = { id: "66666666-6666-4666-8666-666666666666", title: body.title, body: body.body,
        version: 1, authorId: accountId, createdAt: new Date().toISOString(), withdrawnAt: null };
      announcements = [item]; return reply(item, 201);
    }
    errors.push(method + " " + path); return reply("Unexpected Campus test request", 500);
  };
  return { serve, requests, errors };
}

test("Campus setup requires explicit activation before staff announcements, and pausing revokes them", async ({ page }) => {
  const f = fixture();
  const browserErrors = []; page.on("pageerror", e => browserErrors.push(e.message));
  page.on("dialog", dialog => dialog.accept());
  await page.route("**/*", f.serve);
  await page.goto(campusPath);
  await expect(page.getByRole("heading", { name: "Virtual Campus", exact: true })).toBeVisible();
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate Campus" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save Campus setup" }).click();
  await expect(page.getByRole("button", { name: "Activate Campus" })).toBeVisible();
  await expect(page.getByText("Setup", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campus announcements" })).toHaveCount(0);
  await page.getByRole("button", { name: "Activate Campus" }).click();
  await expect(page.getByRole("heading", { name: "Campus announcements" })).toBeVisible();
  await page.getByLabel("Announcement title").fill("Academic term update");
  await page.getByLabel("Announcement details").fill("Staff planning begins next Monday.");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(page.getByRole("heading", { name: "Academic term update" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campus announcements" })).toHaveCount(0);
  expect(f.requests.map(r => r.action)).toEqual(["setup", "activate", "publish", "pause"]);
  expect(f.errors).toEqual([]); expect(browserErrors).toEqual([]);
});

test("Verified headquarters without a verified Liberia operating site cannot configure Campus", async ({ page }) => {
  const f = fixture(false);
  await page.route("**/*", f.serve);
  await page.goto(campusPath);
  await expect(page.getByText("Restricted", { exact: true })).toBeVisible();
  await expect(page.getByText("A verified operating location in Liberia is required.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate Campus" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Campus setup" })).toHaveCount(0);
  expect(f.requests).toEqual([]); expect(f.errors).toEqual([]);
});
