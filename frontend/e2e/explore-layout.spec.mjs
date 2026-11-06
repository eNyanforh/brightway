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
const formats = [
  { type: "ACHIEVEMENT", choice: "Share an Achievement", editor: "Write an achievement", label: "Achievement", heading: "A milestone worth celebrating", body: "I finished my first research project!" },
  { type: "EVENT", choice: "Create an Event", editor: "Write an event", label: "Event", heading: "What's happening", body: "Join our student research workshop on Friday at 2 PM." },
  { type: "QUESTION", choice: "Ask a Question", editor: "Write a question", label: "Question", heading: "Let's learn together", body: "How can I find a mentor for my first programming project?" },
];

async function fixture(page, posts = [fixturePost]) {
  const writes = [];
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
      case "/api/v1/explore/posts": return reply({ items: posts, nextCursor: null });
      case "/api/v1/posts/me": {
        const draft = request.postDataJSON();
        writes.push(draft);
        return reply({ post: {
          id: "new-post", body: draft.body, type: draft.type, tags: draft.tags,
          createdAt: fixturePost.createdAt,
          member: { name: "Synthetic Member", username: "synthetic" },
        } }, 201);
      }
      default: throw Error("Unexpected synthetic request " + url.pathname);
    }
  });
  return writes;
}

test("Explore shows the compact three-action launcher instead of an always-open post box", async ({ page, isMobile }, testInfo) => {
  const writes = await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const explore = page.getByRole("region", { name: "Explore", exact: true });
  const billboard = explore.getByRole("region", { name: "BrightWay billboard" });
  const launcher = explore.getByRole("group", { name: "Choose how to contribute" });
  const achievement = launcher.getByRole("button", { name: "Share an Achievement" });
  const event = launcher.getByRole("button", { name: "Create an Event" });
  const question = launcher.getByRole("button", { name: "Ask a Question" });
  await expect(explore.getByRole("heading", { name: "Discover what’s possible" })).toBeVisible();
  await expect(explore.getByRole("heading", { name: "Stories & progress" })).toBeVisible();
  for (const [label, destination] of [["Opportunities", "/opportunities"], ["Your network", "/network"], ["Keep learning", "/learning"]]) {
    await expect(explore.getByRole("navigation", { name: "Explore shortcuts" }).getByRole("link", { name: new RegExp(label) }))
      .toHaveAttribute("href", destination);
  }
  await expect(explore.getByRole("navigation", { name: "Explore feed" }).getByRole("button", { name: "For You" })).toHaveAttribute("aria-pressed", "true");
  await expect(billboard.getByRole("heading", { name: "Find your next challenge" })).toBeVisible();
  await expect(billboard.getByRole("link", { name: "Browse opportunities" })).toHaveAttribute("href", "/opportunities");
  await expect(billboard.getByRole("button", { name: "Play slideshow" })).toBeVisible();
  await expect(launcher.getByRole("img", { name: "Your profile photo" })).toBeVisible();
  for (const action of [achievement, event, question]) await expect(action).toBeVisible();
  await expect(explore.getByRole("button", { name: "Share a Post" })).toHaveCount(0);
  await expect(explore.getByRole("form", { name: "Create a post" })).toHaveCount(0);

  const card = explore.getByRole("article").first();
  await expect(card.getByText("Post", { exact: true })).toBeVisible();
  await expect(card.locator(".bw-post-story")).toHaveCount(0);
  for (const action of ["Comments", "Repost", "Like", "Save post"]) {
    await expect(card.getByRole("button", { name: action, exact: true })).toBeVisible();
  }
  const bounds = await Promise.all([
    billboard.boundingBox(), launcher.boundingBox(),
    explore.getByRole("complementary", { name: "Explore sidebar" }).boundingBox(),
  ]);
  expect(bounds[0].y).toBeLessThan(bounds[1].y);
  if (isMobile) expect(bounds[2].y).toBeGreaterThan(bounds[1].y);
  else expect(bounds[2].x).toBeGreaterThan(bounds[0].x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await testInfo.attach("Compact Explore launcher", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await billboard.getByRole("button", { name: "Next slide" }).click();
  await expect(billboard.getByRole("heading", { name: "Celebrate the winners" })).toBeVisible();
  await billboard.getByRole("button", { name: "Virtual Campus spotlight" }).click();
  await expect(billboard.getByRole("link", { name: "Explore learning" })).toHaveAttribute("href", "/learning");

  await achievement.click();
  let editor = explore.getByRole("form", { name: "Create a post" });
  await expect(editor.getByRole("textbox", { name: "Write an achievement" })).toBeVisible();
  await editor.getByRole("textbox", { name: "Write an achievement" }).fill("This draft should not become an event.");
  await event.click();
  await expect(editor.getByRole("textbox", { name: "Write an event" })).toHaveValue("");
  await question.click();
  await expect(editor.getByRole("textbox", { name: "Write a question" })).toHaveValue("");
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(explore.getByRole("form", { name: "Create a post" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

for (const format of formats) {
  test("Explore publishes tagged " + format.type.toLowerCase() + "s with distinct feed presentation", async ({ page }, testInfo) => {
    const writes = await fixture(page);
    await page.goto("/explore");
    const explore = page.getByRole("region", { name: "Explore", exact: true });
    const launcher = explore.getByRole("group", { name: "Choose how to contribute" });
    await launcher.getByRole("button", { name: format.choice }).click();
    const editor = explore.getByRole("form", { name: "Create a post" });
    const content = editor.getByRole("textbox", { name: format.editor });
    await expect(content).toBeVisible();
    await content.fill(format.body);
    const publish = editor.getByRole("button", { name: "Publish " + format.label.toLowerCase() });
    await expect(publish).toBeDisabled();

    const topics = editor.getByRole("textbox", { name: "Topic tags" });
    await topics.fill("#Research");
    await topics.press("Enter");
    await topics.fill("research");
    await topics.press("Enter");
    await expect(editor.getByRole("alert")).toHaveText("That topic is already added.");
    await topics.fill("Community work");
    await editor.getByRole("button", { name: "Add tag" }).click();
    await editor.getByRole("button", { name: "Remove tag Research" }).click();
    await expect(publish).toBeEnabled();

    await testInfo.attach(format.label + " editor", { body: await editor.screenshot(), contentType: "image/png" });
    await publish.click();
    const published = explore.getByRole("article").filter({ hasText: format.body });
    await expect(published.locator(".bw-post-story")).toHaveAttribute("data-post-type", format.type);
    await expect(published.getByText(format.heading)).toBeVisible();
    await expect(published.getByText(format.label, { exact: true })).toBeVisible();
    await expect(published.getByRole("list", { name: "Topic tags" }).getByText("Community work")).toBeVisible();
    await expect(explore.getByRole("form", { name: "Create a post" })).toHaveCount(0);
    await expect(launcher).toBeVisible();
    expect(writes).toEqual([expect.objectContaining({ body: format.body, type: format.type, tags: ["Community work"] })]);
  });
}

test("The feed renders different presentation cards for stored achievements, events and questions", async ({ page }) => {
  const typed = formats.map((format, index) => ({
    ...fixturePost,
    id: "33333333-3333-4333-8333-33333333333" + index,
    type: format.type, body: format.body, tags: ["Learning"],
  }));
  await fixture(page, [...typed, fixturePost]);
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  for (const format of formats) {
    const card = explore.getByRole("article").filter({ hasText: format.body });
    await expect(card.locator(".bw-post-story")).toHaveAttribute("data-post-type", format.type);
    await expect(card.getByText(format.heading)).toBeVisible();
    await expect(card.getByRole("list", { name: "Topic tags" }).getByText("Learning")).toBeVisible();
    await expect(card.getByRole("button", { name: "Comments" })).toBeVisible();
  }
  const legacyCard = explore.getByRole("article").filter({ hasText: fixturePost.body });
  await expect(legacyCard.locator(".bw-post-story")).toHaveCount(0);
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
