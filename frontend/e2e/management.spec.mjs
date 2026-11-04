import { test, expect } from "@playwright/test";
const staff = { id: "mg_11111111-1111-4111-8111-111111111111", username: "synthetic_staff", fullName: "Synthetic Reviewer", realm: "management", isSuperAdmin: false };
const reviewId = "22222222-2222-4222-8222-222222222222";
const context = { allowed: true, staffId: staff.id, username: staff.username, fullName: staff.fullName,
  role: { isSuperAdmin: false, label: "Management staff", version: 1 },
  tools: [{ key: "credentials", label: "Credential reviews", to: "/admin/credentials", allowed: true }], audits: [] };
const review = { id: reviewId, kind: "education", issuerOrganizationId: null, issuerName: null, version: 2, revision: 1, status: "IN_REVIEW", reviewerId: staff.id,
  initialSubmittedAt: "2026-10-18T12:00:00Z", targetAt: "2026-11-01T12:00:00Z", profile: { person: { firstName: "Synthetic", lastName: "Applicant", account: { username: "synthetic_applicant" } } },
  attempts: [{ id: "synthetic-attempt", revision: 1, status: "IN_REVIEW", snapshot: { institution: "Unlisted synthetic school", qualification: "Diploma" }, evidence: [] }], events: [] };
async function fixture(page, { authenticated = false, enroll = false, allowed = true } = {}) {
  const state = { authenticated, accessStatus: 200, calls: [], unexpected: [], pageErrors: [] };
  page.on("pageerror", error => state.pageErrors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4187") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname, body = route.request().postDataJSON(); state.calls.push({ path, body });
    const reply = (data, status = 200) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data } });
    if (path === "/api/v1/management/auth/me") return state.authenticated ? reply({ staff }) : reply("Management sign-in required", 401);
    if (path === "/api/v1/management/auth/login") return reply(enroll ? { step: "enroll", secret: "SYNTHETICSETUPONLY", accountLabel: staff.username } : { step: "mfa" });
    if (path === "/api/v1/management/auth/verify") {
      if (body.code !== "123456" || enroll && body.emailCode !== "654321") return reply("Invalid synthetic proof", 401);
      state.authenticated = true; return reply({ staff, ...(enroll ? { backupCodes: ["abcdef-123456-abcdef-123456"] } : {}) });
    }
    if (path === "/api/v1/management/auth/logout") { state.authenticated = false; return reply({ loggedOut: true }); }
    if (path === "/api/v1/management") return state.accessStatus === 200 ? reply({ ...context, tools: context.tools.map(tool => ({ ...tool, allowed })) }) : reply("Management access check unavailable", state.accessStatus);
    if (path === "/api/v1/admin/credentials") return reply({ reviews: [review], nextCursor: null });
    if (path === `/api/v1/admin/credentials/${reviewId}`) return reply({ review, username: "synthetic_applicant" });
    state.unexpected.push(path); return reply("Unexpected synthetic request", 500);
  });
  return state;
}
async function password(page) {
  await page.getByLabel("Management username or email").fill(staff.username);
  await page.getByLabel("Management password", { exact: true }).fill("synthetic browser passphrase");
  await page.getByRole("button", { name: "Continue securely" }).click();
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
function checkIsolation(state) {
  expect(state.unexpected).toEqual([]); expect(state.pageErrors).toEqual([]);
  expect(state.calls.some(call => /^\/api\/v1\/(auth|profile|work)\//.test(call.path))).toBe(false);
}
test("enrollment requires both proofs, shows backups once, and reaches management without personal requests", async ({ page }) => {
  const state = await fixture(page, { enroll: true }); await page.goto("/superadmin");
  await expect(page.getByRole("heading", { name: "Management sign-in" })).toBeVisible(); await noOverflow(page); await password(page);
  await expect(page.getByLabel("Management authenticator secret")).toBeVisible();
  await page.getByLabel("Management email verification code").fill("654321"); await page.getByLabel("Management authenticator code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Verify management access" }).click(); await expect(page.getByRole("alert")).toContainText("Invalid synthetic proof");
  await page.getByLabel("Management authenticator code", { exact: true }).fill("123456"); await page.getByRole("button", { name: "Verify management access" }).click();
  await expect(page.getByText("abcdef-123456-abcdef-123456")).toBeVisible(); await page.getByRole("button", { name: "I saved my backup codes" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Synthetic Reviewer" })).toBeVisible(); await noOverflow(page);
  await expect(page.getByText("abcdef-123456-abcdef-123456")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out of Management" }).click(); await expect(page.getByRole("heading", { name: "Management sign-in" })).toBeVisible(); checkIsolation(state);
});
test("focus refresh preserves drafts on temporary failure, deduplicates access reads, and clears confirmed denied content", async ({ page }) => {
  const state = await fixture(page, { authenticated: true }); await page.goto("/superadmin/credentials");
  await page.getByRole("button", { name: /Synthetic Applicant/ }).click(); const note = page.getByLabel("Reason shown to the user");
  await note.fill("Preserve this unsaved synthetic review."); await noOverflow(page);
  state.accessStatus = 503; const before = state.calls.length;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert").filter({ hasText: "Existing work is kept" })).toBeVisible();
  await expect(note).toHaveValue("Preserve this unsaved synthetic review."); await expect(note).toBeDisabled();
  for (const path of ["/api/v1/management", "/api/v1/management/auth/me"]) expect(state.calls.slice(before).filter(call => call.path === path)).toHaveLength(1);
  state.accessStatus = 403; await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(note).toHaveCount(0); await expect(page.getByRole("heading", { name: "Management access unavailable" })).toBeVisible(); checkIsolation(state);
});
test("unassigned deep links never mount or request the private review queue", async ({ page }) => {
  const state = await fixture(page, { authenticated: true, allowed: false }); await page.goto("/superadmin/credentials");
  await expect(page.getByRole("heading", { name: "Permission required" })).toBeVisible();
  expect(state.calls.some(call => call.path.startsWith("/api/v1/admin/"))).toBe(false); checkIsolation(state);
});
