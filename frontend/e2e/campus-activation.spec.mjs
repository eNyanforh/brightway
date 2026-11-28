import { campusAreas } from "../../shared/campus-workspace.mjs";
import { test, expect } from "@playwright/test";
test("four-step activation opens the independent Campus on desktop and mobile", async ({ page }) => {
  const id = "11111111-1111-4111-8111-111111111111";
  let draft = { step: 1, version: 0, displayName: "Training NGO", enabledEngines: [] }, campus = null;
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    // Vite source modules also contain /api/; only intercept HTTP API requests.
    if (!path.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith("/auth/me")) return reply({ account: { id: "owner", username: "owner", person: { firstName: "Test", lastName: "Owner" } } });
    if (path.endsWith("/workspace/overview")) { const context = { organization: { id, name: "Training NGO" }, campus, counts: {}, permissions: ["organization.campus.manage"], enginePermissions: {}, organizationPermissions: [] }; return reply({ ...context, areas: campusAreas(context) }); }
    if (path.endsWith("/onboarding/complete")) { campus = { status: "ACTIVE", displayName: draft.displayName, enabledEngines: draft.enabledEngines, version: 2, engineConfigurations: [] }; return reply({ workspacePath: `/campus/${id}`, version: 2 }); }
    if (path.endsWith("/onboarding")) {
      if (route.request().method() === "PUT") { draft = { ...route.request().postDataJSON(), version: draft.version + 1 }; return reply(draft); }
      return reply({ organizationName: "Training NGO", eligible: true, canSetup: true, eligibility: { reasons: [] }, administrator: { membershipId: id, username: "owner" }, draft, campus });
    }
    return reply({ items: [] });
  });
  await page.goto(`/campus/${id}/setup`);
  await expect(page.getByRole("heading", { name: "Eligibility Verification" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Campus display name").fill("Community Campus");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /Grade School/ }).check();
  await page.getByRole("checkbox", { name: /TVET/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /confirm my responsibility/ }).check();
  await page.getByRole("button", { name: "Activate and open Campus" }).click();
  await expect(page).toHaveURL(new RegExp(`/campus/${id}$`));
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByText("Campus Management Workspace", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
