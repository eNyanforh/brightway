import { test, expect } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
const staff = { id: `mg_${id}`, username: "synthetic_root", fullName: "Synthetic Administrator", realm: "management", isSuperAdmin: true };
const tools = [
  ["organizations", "Organization reviews", "/admin/organizations"],
  ["identity", "Identity reviews", "/admin/manual-identity"],
  ["credentials", "Credential reviews", "/admin/credentials"],
  ["photos", "Profile photo reviews", "/admin/profile-photos"],
  ["names", "Name corrections", "/admin/name-changes"],
].map(([key, label, to]) => ({ key, label, to, allowed: true, description: "Synthetic authorized review workspace." }));
const context = { allowed: true, staffId: staff.id, username: staff.username, fullName: staff.fullName, role: { label: "Super Admin", isSuperAdmin: true, version: 1, grantedAt: "2026-10-30T12:00:00Z" }, tools, audits: [] };
const statistics = { staffId: staff.id, asOf: "2026-10-30T12:00:00.000Z", period: { days: 30, timeZone: "UTC", from: "2026-10-01T00:00:00.000Z", to: "2026-10-30T12:00:00.000Z", sevenDayFrom: "2026-10-23T12:00:00.000Z" }, accounts: { total: 1234, active: 1200, suspended: 20, deactivated: 14, emailVerified: 1000, mfaEnabled: 240, newLast7Days: 15, signedInLast7Days: 420 }, organizations: { total: 12, active: 11, suspended: 1, schools: 7, companies: 3, ngos: 2 }, queues: { organizations: 8, identities: 3, credentials: 11 }, registrations: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, count: i % 4 })) };
async function fixture(page) {
  const state = { unexpected: [], errors: [], writes: [], conflictFailure: false };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (url.origin !== "http://127.0.0.1:4187") return route.abort();
    if (!path.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path === "/api/v1/management/auth/me") return reply({ staff });
    if (path === "/api/v1/management") return reply(context);
    if (path === "/api/v1/management/statistics") return reply(statistics);
    if (path === "/api/v1/management/security/backups") { state.writes.push(path); return reply({ backupCodes: ["synthetic-backup-only"] }); }
    if (path === "/api/v1/management/security/conflicts") { state.writes.push(path); return state.conflictFailure ? route.fulfill({ status: 403, json: { success: false, message: "Fresh management MFA required" } }) : reply({ recorded: true }); }
    if (path === "/api/v1/admin/manual-identity/access") return reply({ allowed: true });
    if (path === "/api/v1/admin/manual-identity") return reply({ requests: [{ id, state: "SUBMITTED", targetAt: "2026-11-09T12:00:00Z" }] });
    if (path === `/api/v1/admin/manual-identity/${id}`) return reply({ username: "synthetic_applicant", status: "SUBMITTED", request: { id, version: 1, currentAttemptId: "synthetic-attempt", targetAt: "2026-11-09T12:00:00Z" }, attempts: [{ id: "synthetic-attempt", revision: 1, state: "SUBMITTED", evidence: [] }] });
    if (path === "/api/v1/admin/profile-photos") return reply({ requests: [{ id, state: "PENDING", createdAt: "2026-11-01T12:00:00Z" }] });
    if (path === `/api/v1/admin/profile-photos/${id}`) return reply({ id, username: "synthetic_applicant", state: "PENDING", version: 1, profileVersion: 1, imagesAvailable: false });
    if (path === "/api/v1/admin/name-changes") return reply({ requests: [{ id, state: "SUBMITTED", targetAt: "2026-11-09T12:00:00Z" }] });
    if (path === `/api/v1/admin/name-changes/${id}`) return reply({ id, username: "synthetic_applicant", state: "SUBMITTED", version: 1, evidence: [], evidenceAvailable: false });
    if (path === "/api/v1/admin/organizations") return reply({ requests: [{ id, name: "Synthetic Learning Centre", status: "SUBMITTED", targetAt: "2026-11-09T12:00:00Z" }] });
    if (path === `/api/v1/admin/organizations/${id}`) return reply({ id, name: "Synthetic Learning Centre", status: "SUBMITTED", version: 1, applicantUsername: "synthetic_applicant", representativeRole: "Director", location: { countryCode: "LR", city: "Monrovia" }, type: "SCHOOL", canAssign: true, canReport: false, canDecide: false });
    if (path === "/api/v1/admin/credentials") return reply({ reviews: [], nextCursor: null });
    state.unexpected.push(path); return route.fulfill({ status: 500, json: { success: false, message: "Unexpected synthetic request" } });
  });
  return state;
}
async function checkLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.locator("main h1")).toHaveCount(1);
  // Catch late-loaded legacy light-theme rules leaking onto dark review panels.
  const lowContrast = await page.locator("main :is(h1,h2,h3,h4)").evaluateAll(headings => {
    const rgb = value => value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    const luminance = color => color.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    return headings.filter(node => node.getBoundingClientRect().width).flatMap(node => {
      let ancestor = node, background;
      while (ancestor) { const value = getComputedStyle(ancestor).backgroundColor; if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") { background = rgb(value); break; } ancestor = ancestor.parentElement; }
      const a = luminance(rgb(getComputedStyle(node).color)), b = luminance(background || [255, 255, 255]);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      return ratio < 4.5 ? [{ heading: node.textContent, ratio }] : [];
    });
  });
  expect(lowContrast).toEqual([]);
}

test("every management page has a responsive review layout with current selection and protected controls", async ({ page }, testInfo) => {
  const state = await fixture(page);
  for (const [path, heading, row, detail] of [
    ["/superadmin", "BrightWay Management"],
    ["/superadmin/organizations", "Organization review workspace", /Synthetic Learning Centre #/, "Assign Agent"],
    ["/superadmin/identity", "Identity review workspace", /Identity request #/, "Assign to me and start identity review"],
    ["/superadmin/photos", "Profile photo reviews", /Photo replacement #/, "Assign photo review to me"],
    ["/superadmin/names", "Name-correction reviews", /Name correction #/, "Assign name correction to me"],
    ["/superadmin/credentials", "Credential Review"],
    ["/superadmin/security", "Management security"],
  ]) {
    await page.goto(path); await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    if (path === "/superadmin") await expect(page.getByText("1,234")).toBeVisible();
    if (path === "/superadmin/credentials") await expect(page.getByText("Your queue is clear")).toBeVisible();
    if (row) {
      const item = page.getByRole("button", { name: row }); await item.click();
      await expect(item).toHaveAttribute("aria-pressed", "true"); await expect(page.getByRole("button", { name: detail, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Save .* decision$/ })).toHaveCount(0);
    }
    if (path === "/superadmin/security") {
      await expect(page.locator('nav[aria-label="Management tools"] a[href="/superadmin/identity"]')).toHaveCount(1);
    }
    await checkLayout(page);
    await testInfo.attach(`${path.split("/").at(-1) || "overview"}-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});

test("mobile management menu supports Escape, focus return and navigation; security backups remain dismissible", async ({ page }, testInfo) => {
  const state = await fixture(page); await page.goto("/superadmin"); await expect(page.getByText("1,234")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    const toggle = page.getByRole("button", { name: "Toggle management navigation" });
    await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape"); await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click(); await page.getByRole("navigation", { name: "Management tools" }).getByRole("link", { name: "Identity reviews", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Identity review workspace" })).toBeVisible(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  await page.goto("/superadmin/security");
  await page.getByLabel("Current management password").fill("synthetic passphrase only"); await page.getByLabel("Fresh management authenticator or backup code").fill("123456");
  await page.getByRole("button", { name: "Replace backup codes", exact: true }).click(); await expect(page.getByText("synthetic-backup-only")).toBeVisible();
  await page.getByRole("button", { name: "I saved these codes" }).click(); await expect(page.getByText("synthetic-backup-only")).toHaveCount(0);
  state.conflictFailure = true; await page.getByLabel("Related personal username").fill("synthetic_applicant"); await page.getByLabel("Conflict reason").fill("Synthetic account ownership declaration."); await page.getByRole("button", { name: "Record conflict", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Fresh management MFA required"); await expect(page.getByLabel("Related personal username")).toHaveValue("synthetic_applicant");
  state.conflictFailure = false; await page.getByRole("button", { name: "Record conflict", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Conflict recorded"); await checkLayout(page);
  expect(state.writes).toEqual(["/api/v1/management/security/backups", "/api/v1/management/security/conflicts", "/api/v1/management/security/conflicts"]); expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});
