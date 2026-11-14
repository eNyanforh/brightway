import { expect, test } from "@playwright/test";
import { backgroundMessaging } from "./support/background-messaging.mjs";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";
import { dashboardFixture } from "../src/test/fixtures/organization-dashboard.js";

const orgId = "33333333-3333-4333-8333-333333333333";
const campusId = "55555555-5555-4555-8555-555555555555";
const organization = { id: orgId, name: "BrightWay Community School", type: "SCHOOL", offersTraining: true };
const account = { id: "owner", username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } };
const studentCampus = { id: "registration", campusId, schoolName: "Current Campus", status: "ACTIVE",
  studentStatus: "ACTIVE", available: true, year: "2026", period: "Semester 1", section: "Grade 10 / A" };
const permissions = ["organization.members.manage"];
const context = { accountId: account.id, organization, permissions,
  membership: { role: "PRIMARY_ADMIN", version: 1 }, staffVersion: 1, permissionCatalog: [],
  setup: { organization, required: false, version: 5, canEdit: true },
  workspace: organizationWorkspace(organization, permissions, "PRIMARY_ADMIN") };

async function fixture(page) {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4187") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path === "/api/v1/my-campus") return reply({ items: [studentCampus] });
    if (path === "/api/v1/my-workspace") return reply({ tab: "approved", search: "", items: [organization],
      counts: { approved: 1, pending: 0, invitations: 0, history: 0 }, nextCursor: null });
    const background = backgroundMessaging(route);
    if (background) return background;
    if (path === "/api/v1/auth/me") return reply({ account });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === `/api/v1/organization-workspace/${orgId}`) return reply(context);
    if (path === `/api/v1/organization-workspace/${orgId}/dashboard`) return reply(dashboardFixture(orgId));
    if (path === "/api/v1/explore/posts") return reply({ items: [], nextCursor: null });
    // Other page data is incidental to the shared header geometry.
    return reply({ items: [], nextCursor: null });
  });
}

async function expectOverlappingActiveLeft(page, label, isMobile) {
  const shortcuts = page.getByRole("navigation", { name: "Account shortcuts" });
  const active = shortcuts.getByRole("link", { name: label });
  const personal = shortcuts.getByRole("link", { name: "Open personal account" });
  await expect(active).toBeVisible();
  await expect(personal).toBeVisible();
  await expect(active).toHaveAttribute("aria-current", "true");
  const main = await active.boundingBox();
  const aside = await personal.boundingBox();
  expect(main).toBeTruthy();
  expect(aside).toBeTruthy();
  expect(main.width).toBe(isMobile ? 36 : 43);
  expect(Math.abs(main.width - aside.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(main.height - aside.height)).toBeLessThanOrEqual(1);
  // The leading active avatar overlaps the following personal avatar.
  expect(main.x).toBeLessThan(aside.x);
  expect(aside.x).toBeLessThan(main.x + main.width);
  expect(Math.abs((main.y + main.height / 2) - (aside.y + aside.height / 2))).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("overlapping facepile keeps the active campus and organization on the left", async ({ page, isMobile }) => {
  await fixture(page);
  await page.goto(`/learning?view=campus&campus=${campusId}`);
  await expectOverlappingActiveLeft(page, "Open Current Campus school campus", isMobile);
  await page.goto(`/organization-workspace/${orgId}`);
  await expectOverlappingActiveLeft(page, "Open BrightWay Community School organization workspace", isMobile);
});
