import { expect, test } from "@playwright/test";
import { backgroundMessaging } from "./support/background-messaging.mjs";

test("discovery screens fit the six supported widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The viewport matrix includes phone widths.");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const account = { id: "member", username: "maya", person: { firstName: "Maya", lastName: "Cole" } };
  const post = { id: "22222222-2222-4222-8222-222222222222", type: "ACHIEVEMENT",
    member: { name: "Maya Cole", username: "maya", verified: true },
    body: "Our student team completed its first campus survey in Monrovia.",
    createdAt: "2026-11-13T12:00:00Z", reaction: { liked: false, count: 3 }, tags: [] };
  await page.route("**/api/v1/**", route => {
    const background = backgroundMessaging(route);
    if (background) return background;
    const path = new URL(route.request().url()).pathname;
    let data = { items: [], nextCursor: null };
    if (path.endsWith("/auth/me")) data = { account };
    if (path.endsWith("/work/access")) data = { hasWork: false };
    if (path.endsWith("/profile/me")) data = { profile: { version: 1, location: {}, skills: [], interests: [] } };
    if (path.endsWith("/explore/posts")) data = { items: [post], nextCursor: null };
    return route.fulfill({ json: { success: true, data } });
  });
  for (const route of ["/explore", "/learning", "/opportunities"]) {
    await page.goto(route);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeAttached();
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 840 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), route + " at " + width).toBeLessThanOrEqual(width);
      if (width < 701) {
        const header = page.getByRole("banner");
        await expect(header.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link")).toHaveCount(5);
      }
      if (route === "/explore") await expect(page.getByText(post.body)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(route.slice(1) + "-" + width + ".png") });
    }
  }
  expect(errors).toEqual([]);
});
