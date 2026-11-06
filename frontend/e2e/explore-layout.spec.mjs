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
          id: "new-post", body: draft.body, type: draft.type, tags: draft.tags, eventDetails: draft.eventDetails || null, questionDetails: draft.questionDetails || null,
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
  const dialog = page.getByRole("dialog", { name: "Share an Achievement" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  let editor = dialog.getByRole("form", { name: "Create a post" });
  await expect(editor.getByRole("textbox", { name: "Write an achievement" })).toBeFocused();
  await editor.getByRole("textbox", { name: "Write an achievement" }).fill("This draft should not become an event.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(achievement).toBeFocused();
  await event.click();
  const eventDialog = page.getByRole("dialog", { name: "Create an Event" });
  editor = eventDialog.getByRole("form", { name: "Create a post" });
  await expect(editor.getByRole("textbox", { name: "Write an event" })).toHaveValue("");
  await expect(editor.getByLabel("Event title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(eventDialog).toHaveCount(0);
  await expect(event).toBeFocused();
  await question.click();
  const questionDialog = page.getByRole("dialog", { name: "Ask a Question" });
  editor = questionDialog.getByRole("form", { name: "Create a post" });
  await expect(editor.getByLabel("Question title")).toHaveValue("");
  await expect(editor.getByText("Give some context")).toHaveCount(0);
  await expect(editor.getByLabel("Question title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(questionDialog).toHaveCount(0);
  await expect(question).toBeFocused();
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
    const editor = format.type === "ACHIEVEMENT"
      ? page.getByRole("dialog", { name: "Share an Achievement" }).getByRole("form", { name: "Create a post" })
      : format.type === "EVENT"
        ? page.getByRole("dialog", { name: "Create an Event" }).getByRole("form", { name: "Create a post" })
        : page.getByRole("dialog", { name: "Ask a Question" }).getByRole("form", { name: "Create a post" });
    const content = format.type === "QUESTION" ? editor.getByLabel("Question title") : editor.getByRole("textbox", { name: format.editor });
    await expect(content).toBeVisible();
    if (format.type === "ACHIEVEMENT") {
      await expect(editor.getByText("Every milestone deserves to be seen.")).toBeVisible();
      await expect(editor.getByText("Tell your achievement story")).toBeVisible();
      await expect(editor.getByText("Tip: Mention the milestone, the effort, and the lesson.")).toBeVisible();
      await expect(editor.locator(".bw-achievement-intro")).toBeVisible();
      await expect(editor.getByRole("heading", { name: "Connect your achievement" })).toBeVisible();
      await expect(editor.getByRole("button", { name: "Coding" })).toBeVisible();
    } else {
      await expect(editor.locator(".bw-achievement-intro")).toHaveCount(0);
    }
    await content.fill(format.body);
    if (format.type === "QUESTION") {
      await expect(editor.getByText("Give some context")).toHaveCount(0);
      await expect(editor.locator("textarea")).toHaveCount(0);
      await editor.getByRole("group", { name: "Question type" }).getByRole("button", { name: /Get feedback/ }).click();
      await expect(editor.getByRole("complementary", { name: "Question preview" })).toBeVisible();
    }
    if (format.type === "EVENT") {
      await editor.getByLabel("Event title").fill("Student Research Workshop");
      await editor.getByLabel("Venue or address").fill("Monrovia University Campus");
      await editor.getByRole("group", { name: "Event cover style" }).getByRole("button", { name: "Forest" }).click();
      await expect(editor.getByRole("complementary", { name: "Event preview" })).toBeVisible();
    }
    const publish = editor.getByRole("button", { name: "Publish " + format.label.toLowerCase() });
    await expect(publish).toBeDisabled();

    const topics = editor.getByRole("textbox", { name: format.type === "ACHIEVEMENT" ? "Topics" : "Topic tags" });
    await topics.fill("#Research");
    await topics.press("Enter");
    await topics.fill("research");
    await topics.press("Enter");
    await expect(editor.getByRole("alert").last()).toHaveText("That topic is already added.");
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
    if (format.type === "QUESTION") {
      await expect(published.getByRole("heading", { name: format.body })).toBeVisible();
      await expect(published.locator(".bw-post-story-body")).toHaveCount(0);
    }
    await expect(published.getByRole("list", { name: "Topic tags" }).getByText("Community work")).toBeVisible();
    await expect(page.getByRole("form", { name: "Create a post" })).toHaveCount(0);
    await expect(launcher).toBeVisible();
    expect(writes).toEqual([expect.objectContaining({
      body: format.body, type: format.type, tags: ["Community work"],
      ...(format.type === "QUESTION" ? { questionDetails: {
        title: "How can I find a mentor for my first programming project?", intent: "FEEDBACK",
      } } : {}),
      ...(format.type === "EVENT" ? { eventDetails: expect.objectContaining({
        title: "Student Research Workshop", format: "IN_PERSON", venue: "Monrovia University Campus", coverTheme: "FOREST",
        startAt: expect.any(String), endAt: expect.any(String),
      }) } : {}),
    })]);
  });
}

test("achievement, event and question composers offer the same subject categories", async ({ page }) => {
  await fixture(page);
  await page.goto("/explore");
  const launcher = page.getByRole("group", { name: "Choose how to contribute" });
  const categories = ["Coding", "Art", "Education", "Technology", "Science", "Design",
    "Business", "Engineering", "Health", "Research", "Entrepreneurship", "Community"];
  for (const [choice, dialogLabel] of [
    ["Share an Achievement", "Share an Achievement"],
    ["Create an Event", "Create an Event"],
    ["Ask a Question", "Ask a Question"],
  ]) {
    await launcher.getByRole("button", { name: choice }).click();
    const dialog = page.getByRole("dialog", { name: dialogLabel });
    const editor = dialog.getByRole("form", { name: "Create a post" });
    for (const category of categories) {
      await expect(editor.getByRole("button", { name: category, exact: true })).toBeVisible();
    }
    await editor.getByRole("button", { name: "Community", exact: true }).click();
    await expect(editor.getByRole("list", { name: "Selected topic tags" }).getByRole("button", { name: "Remove tag Community" })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Community", exact: true })).toHaveCount(0);
    await editor.getByRole("button", { name: "Remove tag Community" }).click();
    await expect(editor.getByRole("button", { name: "Community", exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "Close editor" }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test("achievement modal supports suggested topics, close button and mobile-friendly sizing", async ({ page, isMobile }) => {
  await fixture(page);
  await page.goto("/explore");
  const launcher = page.getByRole("group", { name: "Choose how to contribute" });
  const trigger = launcher.getByRole("button", { name: "Share an Achievement" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Share an Achievement" });
  const editor = dialog.getByRole("form", { name: "Create a post" });
  await expect(dialog).toBeVisible();
  await editor.getByRole("button", { name: "Art" }).click();
  await expect(editor.getByRole("list", { name: "Selected topic tags" }).getByText("Art")).toBeVisible();
  await expect(editor.getByText("1/5")).toBeVisible();
  await editor.getByRole("button", { name: "Remove tag Art" }).click();
  await expect(editor.getByText("0/5")).toBeVisible();
  const rect = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(rect.width).toBeLessThanOrEqual(viewport.width);
  expect(rect.height).toBeLessThanOrEqual(viewport.height);
  if (isMobile) expect(rect.width).toBeGreaterThan(viewport.width * .9);
  await editor.getByRole("button", { name: "Close editor" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("question modal supports topic suggestions, focus restoration and mobile layout", async ({ page, isMobile }) => {
  await fixture(page);
  await page.goto("/explore");
  const trigger = page.getByRole("group", { name: "Choose how to contribute" })
    .getByRole("button", { name: "Ask a Question" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Ask a Question" });
  const editor = dialog.getByRole("form", { name: "Create a post" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(editor.getByLabel("Question title")).toBeFocused();
  await editor.getByRole("button", { name: "Coding" }).click();
  await expect(editor.getByRole("list", { name: "Selected topic tags" }).getByText("Coding")).toBeVisible();
  await editor.getByRole("button", { name: "Remove tag Coding" }).click();
  await expect(editor.getByRole("list", { name: "Selected topic tags" }).getByText("Coding")).toHaveCount(0);
  const rect = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(rect.width).toBeLessThanOrEqual(viewport.width);
  expect(rect.height).toBeLessThanOrEqual(viewport.height);
  if (isMobile) expect(rect.width).toBeGreaterThan(viewport.width * .9);
  await editor.getByRole("button", { name: "Close editor" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("The feed renders different presentation cards for stored achievements, events and questions", async ({ page }) => {
  const typed = formats.map((format, index) => ({
    ...fixturePost,
    id: "33333333-3333-4333-8333-33333333333" + index,
    type: format.type, body: format.body, tags: ["Learning"],
    ...(format.type === "QUESTION" ? { questionDetails: {
      title: "How do I find a mentor for my first project?", intent: "GUIDANCE",
    } } : {}),
    ...(format.type === "EVENT" ? { eventDetails: {
      title: "Student Research Workshop", startAt: "2027-01-15T12:00:00Z", endAt: "2027-01-15T14:00:00Z",
      timezone: "Africa/Monrovia", format: "IN_PERSON", venue: "Monrovia University Campus",
      meetingUrl: "", coverTheme: "FOREST",
    } } : {}),
  }));
  await fixture(page, [...typed, fixturePost]);
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  for (const format of formats) {
    const card = explore.getByRole("article").filter({ hasText: format.body });
    await expect(card.locator(".bw-post-story")).toHaveAttribute("data-post-type", format.type);
    await expect(card.getByText(format.heading)).toBeVisible();
    if (format.type === "QUESTION") {
      await expect(card.getByRole("heading", { name: "How do I find a mentor for my first project?" })).toBeVisible();
      await expect(card.getByText("Looking for guidance")).toBeVisible();
    }
    if (format.type === "EVENT") {
      await expect(card.getByRole("heading", { name: "Student Research Workshop" })).toBeVisible();
      await expect(card.getByText(/Monrovia University Campus/)).toBeVisible();
    }
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
