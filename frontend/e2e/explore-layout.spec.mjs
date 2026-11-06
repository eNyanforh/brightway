import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4187";
const account = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "synthetic",
  person: { firstName: "Synthetic", lastName: "Member" },
};
const fixturePost = {
  id: "22222222-2222-4222-8222-222222222222",
  body: "Our study group finished its first community project. Thank you to everyone who helped us bring the idea to life.",
  createdAt: "2026-11-06T09:00:00Z",
  member: { name: "Maya Cole", username: "maya" },
  reaction: { liked: false, count: 3 },
  reposted: false,
  saved: false,
};

async function fixture(page) {
  const writes = [];
  let submission;
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/explore/posts": {
        const published = submission?.moderationStatus === "PUBLISHED"
          ? [{ ...submission, reaction: { liked: false, count: 0 }, reposted: false, saved: false }]
          : [];
        return reply({ items: [...published, fixturePost], nextCursor: null });
      }
      case "/api/v1/posts/me": {
        if (request.method() === "GET") return reply({
          access: { identityVerified: true, profilePublic: true }, items: submission ? [submission] : [], nextCursor: null,
        });
        const draft = request.postDataJSON();
        writes.push(draft);
        submission = { id: "new-post", body: draft.body, type: draft.type, tags: draft.tags, moderationStatus: "PENDING",
          createdAt: fixturePost.createdAt, member: { name: "Synthetic Member", username: "synthetic" } };
        return reply({ post: submission }, 201);
      }
      default: throw Error("Unexpected synthetic request " + url.pathname);
    }
  });
  return { writes, approve: () => { submission.moderationStatus = "PUBLISHED"; } };
}

test("Explore opens with a billboard above its composer and icon-based feed", async ({ page, isMobile }, testInfo) => {
  const { writes, approve } = await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  const billboard = explore.getByRole("region", { name: "BrightWay billboard" });
  const composer = explore.getByRole("form", { name: "Create a post" });
  await expect(explore.getByRole("heading", { name: "Explore", exact: true })).toHaveCount(0);
  await expect(billboard.getByRole("heading", { name: "Find your next challenge" })).toBeVisible();
  await expect(billboard.getByRole("link", { name: "Browse opportunities" })).toHaveAttribute("href", "/opportunities");
  await expect(billboard.getByRole("button", { name: "Play slideshow" })).toBeVisible();
  await expect(composer).toBeVisible();
  const postChoice = composer.getByRole("radio", { name: "Share a Post" });
  const achievementChoice = composer.getByRole("radio", { name: "Share an Achievement" });
  await expect(postChoice).toBeChecked();
  await expect(achievementChoice).toBeVisible();
  await expect(composer.getByRole("radio", { name: "Share an Event" })).toBeVisible();
  const card = explore.getByRole("article").first();
  await expect(card.getByText("Post", { exact: true })).toBeVisible();
  for (const action of ["Comments", "Repost", "Like", "Save post"]) {
    await expect(card.getByRole("button", { name: action, exact: true })).toBeVisible();
  }
  const bounds = await Promise.all([billboard.boundingBox(), composer.boundingBox(), explore.getByRole("complementary", { name: "Explore sidebar" }).boundingBox()]);
  expect(bounds[0].y).toBeLessThan(bounds[1].y);
  if (isMobile) expect(bounds[2].y).toBeGreaterThan(bounds[1].y);
  else expect(bounds[2].x).toBeGreaterThan(bounds[0].x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await testInfo.attach("Explore layout", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await billboard.getByRole("button", { name: "Next slide" }).click();
  await expect(billboard.getByRole("heading", { name: "Celebrate the winners" })).toBeVisible();
  await billboard.getByRole("button", { name: "Virtual Campus spotlight" }).click();
  await expect(billboard.getByRole("link", { name: "Explore learning" })).toHaveAttribute("href", "/learning");
  const body = "I completed my first BrightWay project.";
  await composer.getByRole("textbox", { name: "Write a post" }).fill(body);
  await postChoice.press("ArrowRight");
  await expect(achievementChoice).toBeChecked();
  await expect(composer.getByRole("textbox", { name: "Write an achievement" })).toHaveValue(body);
  const publish = composer.getByRole("button", { name: "Submit for review", exact: true });
  await expect(publish).toBeDisabled();
  const topics = composer.getByRole("textbox", { name: "Topic tags" });
  await topics.fill("#Research");
  await topics.press("Enter");
  await topics.fill("research");
  await topics.press("Enter");
  await expect(composer.getByRole("alert")).toHaveText("That topic is already added.");
  await topics.fill("Community work");
  await composer.getByRole("button", { name: "Add tag" }).click();
  await composer.getByRole("button", { name: "Remove tag Research" }).click();
  await expect(publish).toBeEnabled();
  await testInfo.attach("Achievement composer", { body: await composer.screenshot(), contentType: "image/png" });
  await publish.click();
  await expect(explore.getByRole("status").filter({ hasText: "Post submitted for review." })).toBeVisible();
  await expect(explore.getByRole("article").filter({ hasText: body })).toHaveCount(0);
  await expect(postChoice).toBeChecked();
  expect(writes).toEqual([expect.objectContaining({ body, type: "ACHIEVEMENT", tags: ["Community work"] })]);
  await explore.getByRole("link", { name: "Track your submissions" }).click();
  const pending = page.getByRole("article").filter({ hasText: body });
  await expect(pending.getByText("Pending review")).toBeVisible();
  approve();
  await page.getByRole("link", { name: "Back to Explore" }).click();
  const published = explore.getByRole("article").filter({ hasText: body });
  await expect(published.getByText("Achievement", { exact: true })).toBeVisible();
  await expect(published.getByRole("list", { name: "Topic tags" }).getByText("Community work")).toBeVisible();
});

test("the billboard rotates and stops when the member pauses it", async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await page.goto("/explore");
  const billboard = page.getByRole("region", { name: "BrightWay billboard" });
  await expect(billboard.getByRole("heading", { name: "Find your next challenge" })).toBeVisible();
  await page.clock.fastForward(6500);
  await expect(billboard.getByRole("heading", { name: "Celebrate the winners" })).toBeVisible();
  await billboard.getByRole("button", { name: "Pause slideshow" }).click();
  await expect(billboard.getByRole("button", { name: "Play slideshow" })).toBeVisible();
  await page.mouse.move(0, 0);
  await billboard.getByRole("button", { name: "Play slideshow" }).blur();
  await page.clock.fastForward(13000);
  await expect(billboard.getByRole("heading", { name: "Celebrate the winners" })).toBeVisible();
});
