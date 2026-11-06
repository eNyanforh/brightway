import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4187";
const account = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "synthetic",
  person: { firstName: "Synthetic", lastName: "Member" },
};

test("Explore loads people suggestions only when opened", async ({ page }) => {
  let reads = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/explore/posts": return reply({ items: [], nextCursor: null });
      case "/api/v1/explore/suggestions/people":
        reads++;
        return reply({ items: [{ name: "Maya Cole", username: "maya", reasons: ["Shared skills"] }] });
      default: throw Error("Unexpected synthetic request " + url.pathname);
    }
  });
  await page.goto("/explore");
  await expect(page.getByText("Posts from verified people and organizations will appear here.")).toBeVisible();
  const toggle = page.getByText("Suggested people", { exact: true });
  await expect(toggle).toBeVisible();
  expect(reads).toBe(0);
  await toggle.click();
  await expect(page.getByRole("link", { name: "Maya Cole" })).toHaveAttribute("href", "/people/maya");
  await expect(page.getByText("Shared skills", { exact: true })).toBeVisible();
  await toggle.click();
  await expect(page.getByRole("link", { name: "Maya Cole" })).toHaveCount(0);
  expect(reads).toBe(1);
  expect(errors).toEqual([]);
});
