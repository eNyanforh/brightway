import { test, expect } from "@playwright/test";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";
import { dashboardFixture } from "../src/test/fixtures/organization-dashboard.js";
const id = "33333333-3333-4333-8333-333333333333", base = `/organization-workspace/${id}`;
test("organization tab navigation stays mounted during delayed access reads and clears on denial", async ({ page, isMobile }) => {
  const organization = { id, name: "Synthetic School", type: "SCHOOL", offersTraining: true };
  const permissions = ["organization.members.manage", "organization.credentials.education.review"];
  const context = { accountId: "owner", organization, permissions, membership: { role: "PRIMARY_ADMIN", version: 1 }, staffVersion: 1,
    permissionCatalog: [], workspace: organizationWorkspace(organization, permissions, "PRIMARY_ADMIN"), setup: { organization, required: false, version: 5, canEdit: true } };
  const errors = [], unexpected = []; let hold = false, release;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4187") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname, reply = (data, status = 200) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data } });
    if (path === "/api/v1/auth/me") return reply({ account: { id: "owner", username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } } });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === `/api/v1${base}`) { if (hold) return new Promise(resolve => { release = async () => { await reply("Membership withdrawn", 403); resolve(); }; }); return reply(context); }
    if (path === `/api/v1${base}/dashboard`) return reply(dashboardFixture(id));
    if (path === `/api/v1${base}/staff`) return reply({ organizationId: id, staffVersion: 1, members: [], invitations: [] });
    if (path === `/api/v1${base}/credential-reviews`) return reply({ organization, workspace: context.workspace, reviews: [] });
    unexpected.push(path); return reply("Unexpected synthetic API call", 500);
  });
  await page.goto(base); await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: isMobile ? "Mobile organization navigation" : "Organization tools", exact: true });
  const tool = nav.getByRole("link", { name: isMobile ? "Reviews" : "Credential Review", exact: true });
  await expect(tool).toBeVisible(); await nav.evaluate(node => { node.dataset.navigationProbe = "original"; });
  hold = true; await tool.click(); await expect.poll(() => typeof release).toBe("function");
  await expect(nav).toHaveAttribute("data-navigation-probe", "original");
  await expect(tool).toBeVisible(); await expect(nav.getByRole("link", { name: "Staff", exact: true })).toBeVisible();
  await expect(page.getByText("Organization access is checked before tools are shown.")).toHaveCount(0);
  await release(); await expect(page.getByRole("alert")).toContainText("Membership withdrawn");
  await expect(nav.getByRole("link", { name: "Staff", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
