import { backgroundMessaging } from "./support/background-messaging.mjs";
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
  { type: "POST", choice: "Create Post", editor: "Write a post", label: "Post", body: "Here is a useful online study guide for new programmers." },
  { type: "ACHIEVEMENT", choice: "Share an Achievement", editor: "Write an achievement", label: "Achievement", heading: "A milestone worth celebrating", body: "I finished my first research project!" },
  { type: "EVENT", choice: "Create an Event", editor: "Write an event", label: "Event", heading: "What's happening", body: "Join our student research workshop on Friday at 2 PM." },
  { type: "QUESTION", choice: "Ask a Question", editor: "Write a question", label: "Question", heading: "Let's learn together", body: "How can I find a mentor for my first programming project?" },
];

async function fixture(page, posts = [fixturePost], submittedStatus = "PUBLISHED", submittedNotice = null) {
  const writes = [];
  await page.route("**/*", async route => {
    const background = backgroundMessaging(route); if (background) return background;
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: { success: true, data } });
    if (/^\/api\/v1\/explore\/posts\/(member|organization)\/[^/]+\/view$/.test(url.pathname)) return reply({ views: 1 });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/explore/posts": return reply({ items: posts, nextCursor: null });
      case "/api/v1/learning/discover":
      case "/api/v1/opportunities": return reply({ items: [], nextCursor: null });
      case "/api/v1/posts/me": {
        const draft = request.postDataJSON();
        writes.push(draft);
        return reply({ post: {
          id: "new-post", body: draft.body, type: draft.type, tags: draft.tags, eventDetails: draft.eventDetails || null, questionDetails: draft.questionDetails || null,
          createdAt: fixturePost.createdAt, moderationStatus: submittedStatus, moderationVersion: 1, moderationFeedback: null, moderationNotice: submittedNotice,
          member: { name: "Synthetic Member", username: "synthetic" },
        } }, 201);
      }
      default: throw Error("Unexpected synthetic request " + url.pathname);
    }
  });
  return writes;
}


test("Explore remains readable at tablet width without horizontal scrolling", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 820, height: 950 });
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  const billboard = explore.getByRole("region", { name: "BrightWay billboard" });
  const sidebar = explore.getByRole("complementary", { name: "Explore sidebar" });
  const launcher = explore.getByRole("group", { name: "Choose how to contribute" });
  const billboardBox = await billboard.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(sidebarBox.y).toBeGreaterThan(billboardBox.y + billboardBox.height);
  await expect(launcher.getByRole("button", { name: "Create an Event" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("Explore shows the compact four-action launcher instead of an always-open post box", async ({ page, isMobile }, testInfo) => {
  const writes = await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const explore = page.getByRole("region", { name: "Explore", exact: true });
  const billboard = explore.getByRole("region", { name: "BrightWay billboard" });
  const launcher = explore.getByRole("group", { name: "Choose how to contribute" });
  const post = launcher.getByRole("button", { name: "Create Post" });
  const achievement = launcher.getByRole("button", { name: "Share an Achievement" });
  const event = launcher.getByRole("button", { name: "Create an Event" });
  const question = launcher.getByRole("button", { name: "Ask a Question" });
  await expect(explore.getByRole("heading", { name: "Explore community" })).toHaveCount(1);
  await expect(explore.getByText("Discover what’s possible")).toHaveCount(0);
  await expect(explore.getByRole("navigation", { name: "Explore feed" }).getByRole("button", { name: "For You" })).toHaveAttribute("aria-pressed", "true");
  await expect(billboard.getByRole("heading", { name: "Find your next challenge" })).toBeVisible();
  await expect(billboard.getByRole("link", { name: "Browse opportunities" })).toHaveAttribute("href", "/opportunities");
  await expect(billboard.getByRole("button", { name: "Play slideshow" })).toBeVisible();
  await expect(launcher.getByRole("img", { name: "Your profile photo" })).toBeVisible();
  for (const action of [post, achievement, event, question]) await expect(action).toBeVisible();
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

  await post.click();
  const postDialog = page.getByRole("dialog", { name: "Create Post" });
  await expect(postDialog).toBeVisible();
  await expect(postDialog.getByRole("textbox", { name: "Write a post" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(postDialog).toHaveCount(0);
  await expect(post).toBeFocused();

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
  test("Explore publishes tagged " + format.type.toLowerCase() + "s immediately", async ({ page }, testInfo) => {
    const writes = await fixture(page);
    await page.goto("/explore");
    const explore = page.getByRole("region", { name: "Explore", exact: true });
    const launcher = explore.getByRole("group", { name: "Choose how to contribute" });
    await launcher.getByRole("button", { name: format.choice }).click();
    const editor = format.type === "POST"
      ? page.getByRole("dialog", { name: "Create Post" }).getByRole("form", { name: "Create a post" })
      : format.type === "ACHIEVEMENT"
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
      await editor.getByRole("spinbutton", { name: "Ticket price" }).fill("25.50");
      await editor.getByRole("combobox", { name: "Currency" }).selectOption("LRD");
      await editor.getByRole("switch", { name: /Require approval/ }).click();
      await editor.getByRole("switch", { name: /Set a capacity limit/ }).click();
      await editor.getByRole("spinbutton", { name: "Maximum attendees" }).fill("12");
      await expect(editor.getByRole("complementary", { name: "Event preview" })).toContainText("LRD 25.50");
      await expect(editor.getByRole("complementary", { name: "Event preview" })).toContainText("Host approval required");
      await expect(editor.getByRole("complementary", { name: "Event preview" })).toContainText("12 seats");
      await editor.getByRole("group", { name: "Event cover style" }).getByRole("button", { name: "Forest" }).click();
      await expect(editor.getByRole("complementary", { name: "Event preview" })).toBeVisible();
    }
    const publish = editor.getByRole("button", { name: "Publish " + format.label.toLowerCase() });
    await expect(publish).toBeDisabled();

    const topics = editor.getByRole("textbox", { name: ["ACHIEVEMENT", "POST"].includes(format.type) ? "Topics" : "Topic tags" });
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
    await expect(explore.getByRole("article").filter({ hasText: format.body })).toBeVisible();
    await expect(explore.getByText("Post published. BrightWay Management may review it later.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Create a post" })).toHaveCount(0);
    await expect(launcher).toBeVisible();
    expect(writes).toEqual([expect.objectContaining({
      body: format.body, type: format.type, tags: ["Community work"],
      ...(format.type === "QUESTION" ? { questionDetails: {
        title: "How can I find a mentor for my first programming project?", intent: "FEEDBACK",
      } } : {}),
      ...(format.type === "EVENT" ? { eventDetails: expect.objectContaining({
        title: "Student Research Workshop", format: "IN_PERSON", venue: "Monrovia University Campus", coverTheme: "FOREST",
        ticketPriceCents: 2550, currency: "LRD", requiresApproval: true, capacity: 12,
        startAt: expect.any(String), endAt: expect.any(String),
      }) } : {}),
    })]);
  });
}

test("achievement publishes immediately without AI screening", async ({ page }) => {
  const writes = await fixture(page, [fixturePost], "PUBLISHED");
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  await explore.getByRole("button", { name: "Share an Achievement" }).click();
  const editor = page.getByRole("dialog", { name: "Share an Achievement" }).getByRole("form", { name: "Create a post" });
  await editor.getByRole("textbox", { name: "Write an achievement" }).fill("I completed a programming course and created my first app.");
  await editor.getByRole("button", { name: "Coding" }).click();
  await editor.getByRole("button", { name: "Publish achievement" }).click();
  await expect(explore.getByText("Post published. BrightWay Management may review it later.")).toBeVisible();
  const published = explore.getByRole("article").filter({ hasText: "I completed a programming course and created my first app." });
  await expect(published).toBeVisible();
  await expect(published.locator(".bw-post-story")).toHaveAttribute("data-post-type", "ACHIEVEMENT");
  expect(writes).toHaveLength(1);
});

test("event admission settings validate ticket price and capacity before publishing", async ({ page }) => {
  await fixture(page);
  await page.goto("/explore");
  await page.getByRole("button", { name: "Create an Event" }).click();
  const editor = page.getByRole("dialog", { name: "Create an Event" });
  const publish = editor.getByRole("button", { name: "Publish event" });
  await expect(editor.getByRole("switch", { name: /Require approval/ })).toHaveAttribute("aria-checked", "false");
  await expect(editor.getByRole("switch", { name: /Set a capacity limit/ })).toHaveAttribute("aria-checked", "false");
  await expect(editor.getByRole("spinbutton", { name: "Ticket price" })).toHaveValue("0");
  await expect(editor.getByRole("complementary", { name: "Event preview" })).toContainText("Free admission");
  await editor.getByRole("spinbutton", { name: "Ticket price" }).fill("-1");
  await expect(editor.getByText(/Enter a valid ticket price up to/)).toBeVisible();
  await expect(publish).toBeDisabled();
  await editor.getByRole("spinbutton", { name: "Ticket price" }).fill("100.123");
  await expect(publish).toBeDisabled();
  await editor.getByRole("spinbutton", { name: "Ticket price" }).fill("0");
  await editor.getByRole("switch", { name: /Set a capacity limit/ }).click();
  await editor.getByRole("spinbutton", { name: "Maximum attendees" }).fill("0");
  await expect(editor.getByText("Enter a capacity between 1 and 100,000.")).toBeVisible();
  await expect(publish).toBeDisabled();
  await editor.getByRole("spinbutton", { name: "Maximum attendees" }).fill("50");
  await expect(editor.getByRole("spinbutton", { name: "Maximum attendees" })).toHaveValue("50");
  await editor.getByRole("switch", { name: /Require approval/ }).click();
  await expect(editor.getByRole("switch", { name: /Require approval/ })).toHaveAttribute("aria-checked", "true");
  await expect(editor.getByRole("complementary", { name: "Event preview" })).toContainText("50 seats");
  await expect(editor.getByText(/BrightWay does not collect event payments yet/)).toBeVisible();
});

test("event admission displays capacity, ticket price, and pending status without counting requests", async ({ page }) => {
  const event = {
    ...fixturePost, id: "d9000000-0000-4000-8000-000000000009", type: "EVENT",
    body: "Join our advanced research session.", tags: ["Research"],
    eventDetails: {
      title: "Advanced Research Session", startAt: "2027-01-15T12:00:00Z",
      endAt: "2027-01-15T14:00:00Z", timezone: "UTC", format: "ONLINE", meetingUrl: "",
      coverTheme: "NAVY", ticketPriceCents: 3500, currency: "USD",
      requiresApproval: true, capacity: 2,
    },
    registration: { registered: false, status: null, count: 1 }, eventAttendees: [],
  };
  await fixture(page, [event]);
  const calls = [];
  await page.route("**/api/v1/explore/posts/member/*/register", route => {
    const registered = route.request().postDataJSON().registered;
    calls.push(registered);
    return route.fulfill({ json: { success: true, data: {
      registration: { registered: false, status: registered ? "PENDING" : null, count: 1 },
      eventAttendees: [],
    } } });
  });
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: "Advanced Research Session" });
  await expect(card.getByRole("group", { name: "Event admission details" })).toContainText("USD 35.00");
  await expect(card.getByRole("group", { name: "Event admission details" })).toContainText("Approval required");
  await expect(card.getByRole("group", { name: "Event admission details" })).toContainText("Capacity: 2");
  await expect(card.getByText("BrightWay does not collect payments.")).toBeVisible();
  await expect(card.locator(".bw-event-attendee-summary")).toContainText("1 person attending");
  await card.getByRole("button", { name: "I'm going" }).click();
  await expect(card.getByRole("button", { name: "Request pending — cancel attendance request" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("button", { name: "Request pending — cancel attendance request" }))
    .toContainText("Pending");
  await expect(card.locator(".bw-event-attendee-summary")).toContainText("1 person attending");
  await card.getByRole("button", { name: "Request pending — cancel attendance request" }).click();
  await expect(card.getByRole("button", { name: "I'm going" })).toBeVisible();
  expect(calls).toEqual([true, false]);
});

test("event host can review, approve and decline attendance requests", async ({ page }) => {
  const event = {
    ...fixturePost, id: "da000000-0000-4000-8000-000000000001",
    member: { name: "Synthetic Member", username: "synthetic", verified: true },
    type: "EVENT", body: "Review the scholarship session attendee requests.",
    tags: ["Scholarships"], eventDetails: {
      title: "Scholarship Q&A Session", startAt: "2027-01-15T12:00:00Z",
      endAt: "2027-01-15T14:00:00Z", timezone: "UTC", format: "ONLINE", meetingUrl: "",
      requiresApproval: true, ticketPriceCents: 0, currency: "USD", capacity: 3, coverTheme: "NAVY",
    }, registration: { registered: false, status: null, count: 0 }, eventAttendees: [],
  };
  const pending = [
    { id: "da000000-0000-4000-8000-000000000002", username: "maya",
      name: "Maya Cole", verified: true, photoId: null, createdAt: "2026-11-09T12:00:00Z" },
    { id: "da000000-0000-4000-8000-000000000003", username: "private_member",
      createdAt: "2026-11-09T13:00:00Z" },
  ];
  let approvedCount = 0;
  const decisions = [];
  await fixture(page, [event]);
  await page.route("**/api/v1/explore/posts/member/*/registration-requests**", route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") return route.fulfill({
      json: { success: true, data: { items: pending, pendingCount: pending.length, hasMore: false } },
    });
    const id = url.pathname.split("/").at(-1);
    const approved = route.request().postDataJSON().approved;
    decisions.push({ id, approved });
    const ix = pending.findIndex(item => item.id === id);
    if (ix !== -1) pending.splice(ix, 1);
    if (approved) approvedCount++;
    return route.fulfill({
      json: { success: true, data: {
        registration: { registered: false, status: null, count: approvedCount },
        eventAttendees: approved ? [{ username: "maya", name: "Maya Cole", verified: true, photoId: null }] : [],
        pendingCount: pending.length,
      } },
    });
  });
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: "Scholarship Q&A Session" });
  await card.getByRole("button", { name: "Manage attendance requests" }).click();
  const panel = card.getByRole("region", { name: "Attendance requests" });
  await expect(panel).toContainText("Pending approval");
  await expect(panel.getByRole("link", { name: "Maya Cole" })).toHaveAttribute("href", "/maya");
  await expect(panel.getByText("@private_member")).toBeVisible();
  await panel.getByRole("button", { name: "Approve" }).first().click();
  await expect(card.locator(".bw-event-attendee-summary")).toContainText("1 person attending");
  await expect(panel.getByRole("link", { name: "Maya Cole" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Decline" }).click();
  await expect(panel).toContainText("No requests awaiting review.");
  expect(decisions).toEqual([
    { id: "da000000-0000-4000-8000-000000000002", approved: true },
    { id: "da000000-0000-4000-8000-000000000003", approved: false },
  ]);
});

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
  const explanationQuestion = {
    ...fixturePost,
    id: "a1111111-1111-4111-8111-111111111111",
    body: "Explain sampling bias to a beginner.",
    type: "QUESTION",
    tags: ["Research"],
    questionDetails: { title: "What is sampling bias?", intent: "EXPLANATION" },
  };
  await fixture(page, [...typed, fixturePost, explanationQuestion]);
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  for (const format of formats) {
    const card = explore.getByRole("article").filter({ hasText: format.body });
    await expect(card.locator(".bw-post-story")).toHaveAttribute("data-post-type", format.type);
    await expect(card.locator(".bw-post-story--compact")).toBeVisible();
    await expect(card.getByText(format.heading)).toHaveCount(0);
    if (format.type === "QUESTION") {
      await expect(card.getByRole("heading", { name: "How do I find a mentor for my first project?" })).toBeVisible();
      await expect(card.getByText("Looking for guidance")).toHaveCount(0);
    }
    if (format.type === "EVENT") {
      await expect(card.getByRole("heading", { name: "Student Research Workshop" })).toBeVisible();
      await expect(card.getByText(/Monrovia University Campus/)).toBeVisible();
    }
    await expect(card.getByRole("list", { name: "Topic tags" }).getByText("Learning")).toBeVisible();
    if (format.type === "QUESTION") {
      await expect(card.getByRole("button", { name: "Comments" })).toHaveCount(0);
      await expect(card.getByRole("region", { name: "Post comments" })).toHaveCount(0);
    } else {
      await expect(card.getByRole("button", { name: "Comments" })).toBeVisible();
    }
  }
  const explanation = explore.getByRole("article").filter({ hasText: explanationQuestion.body });
  await expect(explanation.getByRole("heading", { name: "What is sampling bias?" })).toBeVisible();
  await expect(explanation.getByText("Concept explanation")).toHaveCount(0);
  await expect(explanation.getByRole("list", { name: "Topic tags" }).getByText("Research")).toBeVisible();
  const legacyCard = explore.getByRole("article").filter({ hasText: fixturePost.body });
  await expect(legacyCard.locator(".bw-post-story")).toHaveCount(0);
});

test("post cards show verified publishers and precise relative ages with full publication dates", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-09T12:00:00Z") });
  const durations = [
    ["seconds", "2026-11-09T11:59:55Z", "Just now"],
    ["minutes", "2026-11-09T11:55:00Z", "5m"],
    ["hours", "2026-11-09T09:00:00Z", "3h"],
    ["days", "2026-11-07T12:00:00Z", "2d"],
    ["months", "2026-09-10T12:00:00Z", "2mo"],
    ["years", "2025-11-09T12:00:00Z", "1y"],
    ["calendar date", "2022-11-09T12:00:00Z", /Nov.*2022/],
  ];
  const posts = durations.map(([label, createdAt], i) => ({
    ...fixturePost,
    id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    body: "Publisher age " + label,
    createdAt,
    member: { name: "Maya Cole", username: "maya", verified: true },
  }));
  posts.push({
    ...fixturePost,
    id: "30000000-0000-4000-8000-000000000008",
    body: "Unverified badge fixture",
    member: { name: "Legacy Account", username: "legacy", verified: false },
  });
  posts.push({
    ...fixturePost,
    id: "30000000-0000-4000-8000-000000000009",
    body: "Verified school publisher",
    member: undefined,
    organization: { id: "40000000-0000-4000-8000-000000000001", name: "BrightWay School", username: "brightwayschool" },
  });
  posts.push({
    ...fixturePost,
    id: "30000000-0000-4000-8000-000000000010",
    body: "Verified repost attribution",
    member: { name: "Maya Cole", username: "maya", verified: true },
    repost: { id: "50000000-0000-4000-8000-000000000001",
      member: { name: "John Sample", username: "john", verified: true }, mine: false },
  });
  await fixture(page, posts);
  await page.goto("/explore");
  const card = text => page.getByRole("article").filter({ hasText: text });
  for (const [label, createdAt, expected] of durations) {
    const item = card("Publisher age " + label);
    await expect(item.getByRole("img", { name: "Verified identity" })).toBeVisible();
    const date = item.locator("time");
    await expect(date).toHaveAttribute("datetime", createdAt);
    await expect(date).toHaveText(expected);
    await expect(date).toHaveAttribute("title", /202[0-9]/);
  }
  await expect(card("Unverified badge fixture").getByRole("img", { name: "Verified identity" })).toHaveCount(0);
  await expect(card("Verified school publisher").getByRole("img", { name: "Verified organization" })).toBeVisible();
  await expect(card("Verified repost attribution").getByRole("img", { name: "Verified identity" })).toHaveCount(2);
  const recentTimestamp = card("Publisher age seconds").locator("time");
  await expect(recentTimestamp).toHaveAttribute("aria-label", /Posted just now/);
  await page.clock.fastForward(65_000);
  await expect(recentTimestamp).toHaveText("1m");
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("publisher avatars display real member and organization photos with safe initials fallbacks", async ({ page }) => {
  const personPhoto = "77777777-7777-4777-8777-777777777777";
  const organizationPhoto = "88888888-8888-4888-8888-888888888888";
  const unavailablePhoto = "99999999-9999-4999-8999-999999999999";
  const posts = [
    { ...fixturePost, id: "10000000-0000-4000-8000-000000000001",
      body: "Member with a real profile photo", member: { name: "Maya Cole", username: "maya", photoId: personPhoto } },
    { ...fixturePost, id: "10000000-0000-4000-8000-000000000002",
      body: "Organization with a real profile photo", member: undefined,
      organization: { id: "20000000-0000-4000-8000-000000000001",
        name: "Monrovia School", username: "monroviaschool", profilePhotoId: organizationPhoto } },
    { ...fixturePost, id: "10000000-0000-4000-8000-000000000003",
      body: "Member without a profile photo", member: { name: "No Photo", username: "nophoto", photoId: null } },
    { ...fixturePost, id: "10000000-0000-4000-8000-000000000004",
      body: "Member whose image is unavailable", member: { name: "Broken Picture", username: "broken", photoId: unavailablePhoto } },
  ];
  const requests = [];
  await fixture(page, posts);
  await page.route("**/api/v1/explore/members/*/photo/*", route => {
    requests.push(new URL(route.request().url()).pathname);
    if (route.request().url().includes(unavailablePhoto)) return route.fulfill({ status: 404 });
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#175cd3"/></svg>',
    });
  });
  await page.route("**/api/v1/organizations/*/photo/*", route => {
    requests.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="6" fill="#174f5f"/></svg>',
    });
  });
  await page.goto("/explore");
  const article = body => page.getByRole("article").filter({ hasText: body });
  const member = article(posts[0].body).locator(".bw-timeline-avatar img");
  const organization = article(posts[1].body).locator(".bw-timeline-avatar img");
  await expect(member).toHaveAttribute("src", new RegExp("/explore/members/maya/photo/" + personPhoto + "$"));
  await expect(organization).toHaveAttribute("src", new RegExp("/organizations/" + posts[1].organization.id + "/photo/" + organizationPhoto + "$"));
  await expect.poll(() => member.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect.poll(() => organization.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(article(posts[2].body).locator(".bw-timeline-avatar")).toHaveText("N");
  await expect(article(posts[2].body).locator(".bw-timeline-avatar img")).toHaveCount(0);
  await expect(article(posts[3].body).locator(".bw-timeline-avatar")).toHaveText("B");
  await expect(article(posts[3].body).locator(".bw-timeline-avatar img")).toHaveCount(0);
  expect(requests).toContain("/api/v1/explore/members/maya/photo/" + personPhoto);
  expect(requests).toContain("/api/v1/organizations/" + posts[1].organization.id + "/photo/" + organizationPhoto);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("purpose-driven post cards expose distinct actions and functional registration and answer voting", async ({ page }) => {
  const [achievement, event, question] = formats.map((format, index) => ({
    ...fixturePost,
    id: "44444444-4444-4444-8444-44444444444" + index,
    type: format.type,
    body: format.body,
    tags: ["Education"],
    views: 8,
    ...(format.type === "EVENT" ? { registration: { registered: false, count: 0 }, eventDetails: {
      title: "Community Coding Workshop", startAt: "2027-01-15T12:00:00Z",
      endAt: "2027-01-15T14:00:00Z", timezone: "UTC",
      format: "ONLINE", meetingUrl: "https://meet.example.org/workshop", coverTheme: "NAVY",
    } } : {}),
    ...(format.type === "QUESTION" ? { answerCount: 1, questionDetails: {
      title: format.body, intent: "GUIDANCE",
    } } : {}),
  }));
  await fixture(page, [achievement, event, question]);
  const calls = [];
  await page.route("**/api/v1/explore/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const response = (data, status = 200) =>
      route.fulfill({ status, json: { success: true, data } });
    if (/\/view$/.test(pathname)) return response({ views: 9 });
    if (/\/register$/.test(pathname)) {
      calls.push(request.postDataJSON());
      const registered = request.postDataJSON().registered;
      return response({ registration: { registered, count: registered ? 1 : 0 } });
    }
    if (/\/report$/.test(pathname)) return response({ reported: true }, 201);
    if (/\/answers$/.test(pathname) && request.method() === "GET") {
      return response({ items: [{
        id: "55555555-5555-4555-8555-555555555555", username: "maya",
        body: "Start with the official React documentation.", createdAt: "2026-11-06T10:00:00Z",
        score: 0, myVote: 0, upvoteCount: 0, downvoteCount: 0, commentCount: 0, canDelete: false,
      }], sort: url.searchParams.get("sort") });
    }
    if (/\/vote$/.test(pathname)) {
      calls.push(request.postDataJSON());
      return response({ score: request.postDataJSON().value, myVote: request.postDataJSON().value,
        upvoteCount: request.postDataJSON().value === 1 ? 1 : 0,
        downvoteCount: request.postDataJSON().value === -1 ? 1 : 0 });
    }
    return route.fallback();
  });
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  const achievementCard = explore.getByRole("article").filter({ hasText: achievement.body });
  const eventCard = explore.getByRole("article").filter({ hasText: "Community Coding Workshop" });
  const questionCard = explore.getByRole("article").filter({ hasText: question.body });
  await expect(achievementCard.getByRole("button", { name: "Celebrate" })).toBeVisible();
  await expect(achievementCard.getByRole("button", { name: "Like" })).toHaveCount(0);
  await expect(achievementCard.getByRole("button", { name: "Repost" })).toBeVisible();
  await expect(achievementCard.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(achievementCard.getByLabel(/views$/)).toBeVisible();

  for (const [card, primaryName] of [[eventCard, "I'm going"], [questionCard, "Answer"]]) {
    const actions = card.locator(".bw-timeline-actions--split");
    const primary = actions.locator(".bw-post-primary-action").getByRole("button", { name: primaryName });
    const secondary = actions.locator(".bw-post-secondary-actions");
    await expect(primary).toBeVisible();
    await expect(secondary.getByRole("button", { name: "Share" })).toBeVisible();
    const primaryBox = await primary.boundingBox();
    const secondaryBox = await secondary.boundingBox();
    expect(primaryBox.x + primaryBox.width).toBeLessThanOrEqual(secondaryBox.x + 2);
  }
  await expect(questionCard.getByRole("button", { name: "Comments" })).toHaveCount(0);
  await expect(questionCard.getByRole("region", { name: "Post comments" })).toHaveCount(0);
  await expect(eventCard.getByRole("button", { name: "Comments" })).toBeVisible();
  await expect(eventCard.getByRole("button", { name: "Like" })).toHaveCount(0);
  await eventCard.getByRole("button", { name: "I'm going" }).click();
  await expect(eventCard.getByRole("button", { name: /Going — cancel attendance/ })).toBeVisible();
  expect(calls).toContainEqual({ registered: true });

  await expect(questionCard.getByRole("button", { name: "Like" })).toHaveCount(0);
  await expect(questionCard.getByRole("button", { name: "Repost" })).toHaveCount(0);
  await expect(questionCard.getByRole("button", { name: "Answer" })).toBeVisible();
  await expect(questionCard.getByRole("button", { name: /Upvote answer/ })).toHaveCount(0);
  await questionCard.getByRole("button", { name: "Answer" }).click();
  const answers = questionCard.getByRole("region", { name: "Answers" });
  await expect(answers.getByText("Start with the official React documentation.")).toBeVisible();
  await answers.getByRole("button", { name: "Upvote answer by maya" }).click();
  await expect(answers.getByLabel("Upvotes 1")).toBeVisible();
  await expect(answers.getByLabel("Downvotes 0")).toBeVisible();
  expect(calls).toContainEqual({ value: 1 });
  await questionCard.getByRole("button", { name: "Report question" }).click();
  const report = questionCard.getByRole("form", { name: "Report question" });
  await report.getByRole("button", { name: "Submit report" }).click();
  await expect(questionCard.getByText("Report submitted for moderation.")).toBeVisible();
});

test("modern answer panel keeps voting, sorting and nested reply publishing usable", async ({ page }) => {
  const question = {
    ...fixturePost,
    id: "c1000000-0000-4000-8000-000000000001",
    type: "QUESTION",
    tags: ["Coding"],
    body: "How should beginners learn backend development?",
    questionDetails: { title: "How should beginners learn backend development?", intent: "GUIDANCE" },
    answerCount: 1,
  };
  const answerId = "c2000000-0000-4000-8000-000000000002";
  const imageId = "d1000000-0000-4000-8000-000000000001";
  const answers = [{ id: answerId, username: "maya", name: "Maya Cole", verified: true, photoId: imageId,
    body: "Start small, then build a complete API.", createdAt: "2026-11-09T09:00:00Z",
    score: 2, myVote: 0, upvoteCount: 2, downvoteCount: 0, commentCount: 0, canDelete: false }];
  const replies = [];
  const sorts = [];
  await fixture(page, [question]);
  await page.route("**/api/v1/explore/members/*/photo/*", route => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#174ea6"/></svg>',
  }));
  await page.route("**/api/v1/explore/**", route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname;
    const success = (data, status = 200) => route.fulfill({ status, json: { success: true, data } });
    if (path === "/api/v1/explore/posts/member/" + question.id + "/answers" && request.method() === "GET") {
      sorts.push(url.searchParams.get("sort"));
      return success({ items: answers, sort: sorts.at(-1) });
    }
    if (path === "/api/v1/explore/answers/" + answerId + "/vote") {
      const value = request.postDataJSON().value;
      return success({ myVote: value, score: 2 + value,
        upvoteCount: value === 1 ? 3 : 2, downvoteCount: value === -1 ? 1 : 0 });
    }
    if (path === "/api/v1/explore/answers/" + answerId + "/comments") {
      if (request.method() === "GET") return success({ items: replies });
      if (request.method() === "POST") {
        const comment = { id: "c3000000-0000-4000-8000-000000000003",
          username: "synthetic", name: "Synthetic Member", verified: true, photoId: imageId,
          body: request.postDataJSON().body,
          createdAt: "2026-11-09T10:00:00Z", canDelete: true };
        replies.push(comment);
        return success({ comment }, 201);
      }
    }
    if (path === "/api/v1/explore/answers/" + answerId + "/comments/c3000000-0000-4000-8000-000000000003"
      && request.method() === "DELETE") {
      replies.length = 0;
      return success({ id: "c3000000-0000-4000-8000-000000000003" });
    }
    return route.fallback();
  });
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: question.body });
  await card.getByRole("button", { name: "Answer" }).click();
  const panel = card.getByRole("region", { name: "Answers" });
  await expect(panel.getByText("Community answers")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Your answer" })).toBeVisible();
  await expect(panel.getByText("0 / 2,000")).toBeVisible();
  const answerCard = panel.locator(".bw-answer-card");
  await expect(answerCard).toHaveCount(1);
  await expect(answerCard.getByRole("link", { name: "Maya Cole" })).toHaveAttribute("href", "/maya");
  await expect(answerCard.getByRole("img", { name: "Verified identity" })).toBeVisible();
  await expect(answerCard.locator(".bw-discussion-avatar img")).toHaveAttribute("src",
    new RegExp("/explore/members/maya/photo/" + imageId + "$"));
  await expect.poll(() => answerCard.locator(".bw-discussion-avatar img")
    .evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(answerCard.getByLabel("Upvotes 2")).toBeVisible();
  await expect(answerCard.getByLabel("Downvotes 0")).toBeVisible();
  await answerCard.getByRole("button", { name: "Upvote answer by maya" }).click();
  await expect(answerCard.getByLabel("Upvotes 3")).toBeVisible();
  await expect(answerCard.getByLabel("Downvotes 0")).toBeVisible();
  await expect(answerCard.getByRole("button", { name: "Upvote answer by maya" })).toHaveAttribute("aria-pressed", "true");
  await answerCard.getByRole("button", { name: "Downvote answer by maya" }).click();
  await expect(answerCard.getByLabel("Upvotes 2")).toBeVisible();
  await expect(answerCard.getByLabel("Downvotes 1")).toBeVisible();

  await answerCard.locator(".bw-answer-comment-trigger").click();
  const thread = answerCard.getByRole("region", { name: "Answer comments" });
  await expect(thread.getByText("No replies yet. Add a helpful thought.")).toBeVisible();
  await thread.getByRole("textbox", { name: "Comment on this answer" }).fill("Try building an Express API with tests.");
  await expect(thread.getByText("39 / 1,000")).toBeVisible();
  await thread.getByRole("button", { name: "Post comment" }).click();
  await expect(thread.getByText("Try building an Express API with tests.")).toBeVisible();
  await expect(thread.getByRole("link", { name: "Synthetic Member" })).toBeVisible();
  await expect(thread.getByRole("img", { name: "Verified identity" })).toBeVisible();
  await expect(answerCard.locator(".bw-discussion-action-count")).toHaveText("1");
  await thread.getByRole("button", { name: "Delete comment" }).click();
  await expect(thread.getByText("Delete this reply?")).toBeVisible();
  await thread.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(thread.getByText("No replies yet. Add a helpful thought.")).toBeVisible();

  await panel.getByLabel("Sort answers").selectOption("newest");
  await expect.poll(() => sorts.at(-1)).toBe("newest");
  await expect(panel.getByText("Start small, then build a complete API.")).toBeVisible();
  await panel.getByRole("button", { name: "Close answers" }).click();
  await expect(card.getByRole("region", { name: "Answers" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("modern post comments preserve create, delete, pagination and close behavior", async ({ page }) => {
  const post = { ...fixturePost, id: "c4000000-0000-4000-8000-000000000004",
    type: "ACHIEVEMENT", tags: ["Research"], body: "We published our research summary today." };
  const older = { id: "c5000000-0000-4000-8000-000000000005",
    username: "maya", body: "Well-deserved congratulations!",
    createdAt: "2026-11-08T07:00:00Z", canDelete: false };
  const fresh = { id: "c6000000-0000-4000-8000-000000000006",
    username: "synthetic", name: "Synthetic Member", verified: true,
    photoId: "d1000000-0000-4000-8000-000000000001", body: "This is inspiring work.",
    createdAt: "2026-11-09T10:00:00Z", canDelete: true };
  await fixture(page, [post]);
  await page.route("**/api/v1/explore/members/*/photo/*", route => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="6" fill="#174ea6"/></svg>',
  }));
  const actions = [];
  await page.route("**/api/v1/explore/**", route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname;
    const commentsPath = "/api/v1/explore/posts/member/" + post.id + "/comments";
    const success = (data, status = 200) => route.fulfill({ status, json: { success: true, data } });
    if (path === commentsPath && request.method() === "GET") {
      return success(url.searchParams.has("cursor") ?
        { items: [older], nextCursor: null } : { items: [], nextCursor: "NEXT" });
    }
    if (path === commentsPath && request.method() === "POST") {
      actions.push("post");
      return success({ comment: { ...fresh, body: request.postDataJSON().body } }, 201);
    }
    if (path === commentsPath + "/" + fresh.id && request.method() === "DELETE") {
      actions.push("delete");
      return success({ id: fresh.id });
    }
    return route.fallback();
  });
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: post.body });
  const trigger = card.getByRole("button", { name: "Comments" });
  await trigger.click();
  const panel = card.getByRole("region", { name: "Post comments" });
  await expect(panel.getByText("Start the conversation")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Write a comment" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Post comment" })).toBeDisabled();
  await panel.getByRole("textbox", { name: "Write a comment" }).fill("This is inspiring work.");
  await expect(panel.getByText("23 / 1,000")).toBeVisible();
  await panel.getByRole("button", { name: "Post comment" }).click();
  await expect(panel.getByText("This is inspiring work.")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Synthetic Member" })).toBeVisible();
  await expect(panel.getByRole("img", { name: "Verified identity" })).toBeVisible();
  await expect(panel.locator(".bw-discussion-avatar img")).toHaveAttribute("src",
    /\/explore\/members\/synthetic\/photo\/d1000000-0000-4000-8000-000000000001$/);
  await expect.poll(() => panel.locator(".bw-discussion-avatar img")
    .evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(panel.getByRole("button", { name: "Delete comment" })).toBeVisible();
  await panel.getByRole("button", { name: "Delete comment" }).click();
  await expect(panel.getByText("Delete this comment?")).toBeVisible();
  await panel.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(panel.getByText("Start the conversation")).toBeVisible();

  await panel.getByRole("button", { name: "View older comments" }).click();
  await expect(panel.getByText("Well-deserved congratulations!")).toBeVisible();
  expect(actions).toEqual(["post", "delete"]);
  await panel.getByRole("button", { name: "Close comments" }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("question cards display real answerers beneath topic tags and a distinct Answer action", async ({ page }) => {
  const question = {
    ...fixturePost,
    id: "88888888-8888-4888-8888-888888888888",
    type: "QUESTION",
    body: "How can I learn full-stack development?",
    questionDetails: { title: "How can I learn full-stack development?", intent: "GUIDANCE" },
    tags: ["Coding", "Education"],
    answerCount: 4,
    answerParticipants: [
      { username: "maya", name: "Maya Cole", photoId: null },
      { username: "alex", name: "Alex Rivera", photoId: null },
      { username: "jane", name: "Jane Doe", photoId: null },
      { username: "sam", name: "Sam Brown", photoId: null },
    ],
  };
  await fixture(page, [question]);
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: question.body });
  const topics = card.getByRole("list", { name: "Topic tags" });
  const summary = card.getByLabel("Question answers");
  const facepile = summary.getByRole("group", { name: "Members who answered" });
  await expect(summary).toContainText("4 answers");
  await expect(facepile.getByRole("link")).toHaveCount(3);
  await expect(facepile.getByRole("link", { name: "Sam Brown answered" })).toHaveCount(0);
  await expect(facepile.getByRole("link", { name: "Maya Cole answered" })).toHaveAttribute("href", "/maya");
  await expect(facepile.getByRole("link", { name: "Alex Rivera answered" })).toContainText("AR");
  const tagsBox = await topics.boundingBox();
  const summaryBox = await summary.boundingBox();
  expect(summaryBox.y).toBeGreaterThan(tagsBox.y);
  const answer = card.getByRole("button", { name: "Answer", exact: true });
  await expect(answer).toBeVisible();
  const appearance = await answer.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    radius: getComputedStyle(element).borderRadius,
  }));
  expect(appearance.background).toBe("rgb(23, 92, 211)");
  expect(appearance.radius).toBe("999px");
  await expect(card.getByRole("button", { name: "Comments" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("event cards display real registrant avatars and count, refreshed after registration", async ({ page }) => {
  const personPhoto = "77777777-7777-4777-8777-777777777777";
  const event = {
    ...fixturePost,
    id: "f1111111-1111-4111-8111-111111111111",
    type: "EVENT",
    body: "Join our career opportunities workshop.",
    tags: ["Career"],
    eventDetails: {
      title: "Career Opportunities Workshop",
      startAt: "2027-01-15T12:00:00Z",
      endAt: "2027-01-15T14:00:00Z",
      timezone: "UTC",
      format: "ONLINE",
      meetingUrl: "https://meet.example.org/careers",
      coverTheme: "NAVY",
    },
    registration: { registered: false, count: 42 },
    eventAttendees: [
      { username: "maya", name: "Maya Cole", photoId: personPhoto, verified: true },
      { username: "alex", name: "Alex Rivera", photoId: null, verified: true },
      { username: "sam", name: "Sam Brown", photoId: personPhoto, verified: true },
      { username: "lena", name: "Lena Cooper", photoId: personPhoto, verified: true },
    ],
  };
  await fixture(page, [event]);
  await page.route("**/api/v1/explore/members/*/photo/*", route => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="6" fill="#175cd3"/></svg>',
  }));
  const calls = [];
  await page.route("**/api/v1/explore/**", route => {
    if (!route.request().url().endsWith("/register")) return route.fallback();
    const registered = route.request().postDataJSON().registered;
    calls.push(registered);
    return route.fulfill({ json: { success: true, data: {
      registration: { registered, count: registered ? 43 : 42 },
      eventAttendees: registered
        ? [{ username: "synthetic", name: "Synthetic Member", photoId: personPhoto, verified: true }, ...event.eventAttendees.slice(0, 2)]
        : event.eventAttendees.slice(0, 3),
    } } });
  });
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: "Career Opportunities Workshop" });
  const summary = card.locator(".bw-event-attendee-summary");
  await expect(summary).toContainText("42 people attending");
  const avatars = summary.getByRole("group", { name: "People attending" });
  await expect(avatars.getByRole("link")).toHaveCount(3);
  await expect(avatars.getByRole("link", { name: "Maya Cole attending" }))
    .toHaveAttribute("href", "/maya");
  await expect(avatars.getByRole("link", { name: "Lena Cooper attending" })).toHaveCount(0);
  await expect(avatars.locator("img")).toHaveCount(2);
  await expect.poll(() => avatars.locator("img").first()
    .evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(avatars.getByRole("link", { name: "Alex Rivera attending" })
    .locator("svg")).toBeVisible();
  const goingButton = card.getByRole("button", { name: "I'm going", exact: true });
  await expect(goingButton).toHaveAttribute("aria-pressed", "false");
  await expect(goingButton).toHaveCSS("border-radius", "999px");
  await expect(goingButton).toHaveCSS("color", "rgb(255, 255, 255)");
  await goingButton.click();
  const selectedButton = card.getByRole("button", { name: /Going — cancel attendance/ });
  await expect(selectedButton).toBeVisible();
  await expect(selectedButton).toHaveAttribute("aria-pressed", "true");
  await expect(selectedButton).toHaveCSS("color", /rgb\((18, 103, 72|16, 88, 62)\)/);
  await expect(selectedButton.locator(".bw-going-check-icon")).toBeVisible();
  await expect(summary).toContainText("43 people attending");
  await expect(avatars.getByRole("link", { name: "Synthetic Member attending" })).toBeVisible();
  await card.getByRole("button", { name: /Going — cancel attendance/ }).click();
  await expect(card.getByRole("button", { name: "I'm going", exact: true })).toBeVisible();
  await expect(summary).toContainText("42 people attending");
  await expect(card.getByRole("button", { name: "I'm going", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
  expect(calls).toEqual([true, false]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("answer count and facepile refresh after an answer is published", async ({ page }) => {
  const question = {
    ...fixturePost,
    id: "99999999-9999-4999-8999-999999999999",
    type: "QUESTION",
    body: "Who can explain statistical sampling?",
    questionDetails: { title: "Who can explain statistical sampling?", intent: "EXPLANATION" },
    tags: ["Statistics"], answerCount: 0, answerParticipants: [],
  };
  await fixture(page, [question]);
  await page.route("**/api/v1/explore/posts/member/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/v1/explore/posts/member/" + question.id) {
      return route.fulfill({ json: { success: true, data: { post: {
        ...question, answerCount: 1,
        answerParticipants: [{ username: "synthetic", name: "Synthetic Member", photoId: null }],
      } } } });
    }
    if (pathname === "/api/v1/explore/posts/member/" + question.id + "/answers") {
      if (request.method() === "GET") {
        return route.fulfill({ json: { success: true, data: { items: [], sort: "top" } } });
      }
      const answer = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        username: "synthetic", body: request.postDataJSON().body,
        createdAt: "2026-11-09T08:00:00Z", score: 0, myVote: 0, commentCount: 0, canDelete: true,
      };
      return route.fulfill({ status: 201, json: { success: true, data: { answer } } });
    }
    return route.fallback();
  });
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: question.body });
  const summary = card.getByLabel("Question answers");
  await expect(summary).toContainText("0 answers");
  await expect(summary.getByRole("link")).toHaveCount(0);
  await card.getByRole("button", { name: "Answer" }).click();
  const form = card.getByRole("region", { name: "Answers" });
  await form.getByRole("textbox", { name: "Your answer" }).fill("Use a probability sampling frame.");
  await form.getByRole("button", { name: "Publish answer" }).click();
  await expect(summary).toContainText("1 answer");
  await expect(summary.getByRole("link", { name: "Synthetic Member answered" })).toBeVisible();
});

test("mobile event and question primary actions stay left of the right utility group", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile layout only");
  const [event, question] = ["EVENT", "QUESTION"].map((type, index) => ({
    ...fixturePost, type, id: "66666666-6666-4666-8666-66666666666" + index,
    body: type === "EVENT" ? "Career workshop opening" : "How do I begin my career?",
    views: 21,
    ...(type === "EVENT" ? { registration: { registered: false, count: 0 }, eventDetails: {
      title: "Career workshop", startAt: "2027-01-15T12:00:00Z", endAt: "2027-01-15T14:00:00Z",
      timezone: "UTC", format: "ONLINE", meetingUrl: "https://meet.example.org/career", coverTheme: "NAVY",
    } } : { questionDetails: { title: "How do I begin my career?", intent: "GUIDANCE" }, answerCount: 0 }),
  }));
  await fixture(page, [event, question]);
  await page.route("**/api/v1/explore/posts/*/*/view", route => route.fulfill({
    json: { success: true, data: { views: 22 } },
  }));
  await page.goto("/explore");
  for (const [body, type, name] of [[event.body, "EVENT", "I'm going"], [question.body, "QUESTION", "Answer"]]) {
    const card = page.getByRole("article").filter({ hasText: body });
    const actionBar = card.locator(".bw-timeline-actions--split");
    const leading = actionBar.locator(".bw-post-primary-action").getByRole("button", { name });
    const trailing = actionBar.locator(".bw-post-secondary-actions");
    const mainBox = await leading.boundingBox();
    const trailingBox = await trailing.boundingBox();
    const cardBox = await card.boundingBox();
    expect(mainBox.x + mainBox.width).toBeLessThanOrEqual(trailingBox.x + 2);
    expect(trailingBox.x + trailingBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 2);
    if (type === "QUESTION") await expect(card.getByRole("button", { name: "Comments" })).toHaveCount(0);
  }
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
