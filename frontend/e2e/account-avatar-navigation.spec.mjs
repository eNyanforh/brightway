import { expect, test } from "@playwright/test";
import { backgroundMessaging } from "./support/background-messaging.mjs";

const origin = "http://127.0.0.1:4187";
const organizationId = "11111111-1111-4111-8111-111111111111";
const campusId = "22222222-2222-4222-8222-222222222222";
const account = {
  id: "member",
  username: "synthetic",
  person: { firstName: "Synthetic", lastName: "Member" },
};

async function fixture(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const background = backgroundMessaging(route);
    if (background) return background;
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/work/access": return reply({ hasWork: true });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/my-workspace":
        return reply({ items: [{ id: organizationId, name: "Community Lab" }] });
      case "/api/v1/my-campus":
        return reply({ items: [{
          id: "registration", campusId, schoolName: "Learning Academy",
          status: "ACTIVE", studentStatus: "ACTIVE", available: true,
        }] });
      case "/api/v1/explore/posts":
      case "/api/v1/opportunities":
      case "/api/v1/learning/discover": return reply({ items: [], nextCursor: null });
      default: return reply({ items: [], nextCursor: null });
    }
  });
  return errors;
}

test("overlapping avatar shortcuts directly switch personal, school, and organization on desktop and mobile", async ({ page }) => {
  await fixture(page);
  await page.goto("/explore");
  const shortcuts = page.getByRole("navigation", { name: "Account shortcuts" });
  const personal = shortcuts.getByRole("link", { name: "Open personal account" });
  const organization = shortcuts.getByRole("link", { name: "Open Community Lab organization workspace" });
  const school = shortcuts.getByRole("link", { name: "Open Learning Academy school campus" });
  await expect(organization).toBeVisible();
  await expect(school).toBeVisible();
  await expect(personal).toHaveAttribute("aria-current", "true");
  await expect(personal).toHaveAttribute("href", "/explore");
  await expect(organization).toHaveAttribute("href", `/organization-workspace/${organizationId}`);
  await expect(school).toHaveAttribute("href", `/learning?view=campus&campus=${campusId}`);
  const first = await personal.boundingBox();
  const second = await organization.boundingBox();
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(second.x).toBeGreaterThan(first.x);
  expect(second.x).toBeLessThan(first.x + first.width);
  await organization.click();
  await expect(page).toHaveURL(new RegExp(`/organization-workspace/${organizationId}$`));
  await expect(shortcuts.getByRole("link", { name: "Open Community Lab organization workspace" })).toHaveAttribute("aria-current", "true");
  await shortcuts.getByRole("link", { name: "Open personal account" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await school.click();
  await expect(page).toHaveURL(new RegExp(`/learning\\?view=campus&campus=${campusId}$`));
});
