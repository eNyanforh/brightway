import { backgroundMessaging } from "./support/background-messaging.mjs";
import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
// Regular posts use the generic timeline card; only these three have
// specialized presentation cards and type-specific actions.
const specializedFormats = formats;

async function fixture(page, posts = [fixturePost], submittedStatus = "PUBLISHED", submittedNotice = null, opportunities = []) {
  const writes = [];
  const publishedPosts = [];
  const savedOpportunities = new Set(opportunities.filter(item => item.saved).map(item => item.id));
  await page.route("**/*", async route => {
    const background = backgroundMessaging(route); if (background) return background;
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (/^\/api\/v1\/organizations\/[^/]+\/photo\/[^/]+$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ySN6FcAAAAASUVORK5CYII=", "base64") });
    const reply = (data, status = 200) => route.fulfill({ status, json: { success: true, data } });
    if (/^\/api\/v1\/explore\/posts\/(member|organization)\/[^/]+\/view$/.test(url.pathname)) return reply({ views: 1 });
    // Shared links read one server-authorized post rather than assuming it is in the first feed page.
    if (/^\/api\/v1\/explore\/posts\/(member|organization)\/[^/]+$/.test(url.pathname) && request.method() === "GET") {
      const id = url.pathname.split("/").at(-1);
      const match = [...publishedPosts, ...posts].find(item => item.id === id);
      return match ? reply({ post: match }) : route.fulfill({ status: 404, json: { success: false, message: "Post unavailable." } });
    }
    if (/^\/api\/v1\/opportunities\/[^/]+\/save$/.test(url.pathname) && request.method() === "PUT") {
      const opportunityId = url.pathname.split("/")[4];
      const saved = request.postDataJSON().saved;
      if (saved) savedOpportunities.add(opportunityId);
      else savedOpportunities.delete(opportunityId);
      return reply({ saved });
    }
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/profile/me": return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/explore/posts": return reply({ items: [...publishedPosts, ...posts], nextCursor: null });
      case "/api/v1/learning/discover": return reply({ items: [], nextCursor: null });
      case "/api/v1/opportunities": return reply({ items: opportunities
        .filter(item => (url.searchParams.get("following") !== "true" || item.followed) &&
          (url.searchParams.get("saved") !== "true" || savedOpportunities.has(item.id)))
        .map(item => ({ ...item, saved: savedOpportunities.has(item.id) })), nextCursor: null });
      case "/api/v1/posts/me": {
        const draft = request.postDataJSON();
        writes.push(draft);
        const newPost = {
          id: "new-post", body: draft.body, type: draft.type, tags: draft.tags, eventDetails: draft.eventDetails || null, questionDetails: draft.questionDetails || null,
          createdAt: fixturePost.createdAt, moderationStatus: submittedStatus, moderationVersion: 1, moderationFeedback: null, moderationNotice: submittedNotice,
          member: { name: "Synthetic Member", username: "synthetic" },
        };
        if (submittedStatus === "PUBLISHED") {
          publishedPosts.unshift({ ...newPost, reaction: { liked: false, count: 0 },
            saved: false, reposted: false, views: 0 });
        }
        return reply({ post: newPost }, 201);
      }
      default: throw Error("Unexpected synthetic request " + url.pathname);
    }
  });
  return writes;
}

async function openComposer(page, isMobile, choice = "Share an Achievement") {
  if (isMobile) {
    await page.getByRole("link", { name: "Create Post" }).click();
    await page.getByRole("dialog", { name: "Create a post", exact: true }).getByRole("button", { name: new RegExp(choice) }).click();
  } else await page.getByRole("group", { name: "Choose how to contribute" }).getByRole("button", { name: choice, exact: true }).click();
}
async function documentFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [index, color] of [rgb(.85,.1,.1), rgb(.1,.7,.1), rgb(.1,.1,.85)].entries()) {
    const page = pdf.addPage([600, 750]);
    page.drawRectangle({ x:0, y:0, width:600, height:750, color });
    page.drawText("Document slide " + (index + 1), { x:50, y:630, size:30, font, color:rgb(1,1,1) });
  }
  return Buffer.from(await pdf.save());
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
  await expect(sidebar.locator(".bw-explore-section-eyebrow, .bw-explore-aside-description")).toHaveCount(0);
  await expect(sidebar.getByText("TAKE YOUR NEXT STEP")).toHaveCount(0);
  expect(sidebarBox.y).toBeGreaterThan(billboardBox.y + billboardBox.height);
  await expect(launcher.getByRole("button", { name: "Create an Event" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("Explore shows the compact three-action launcher instead of an always-open post box", async ({ page, isMobile }, testInfo) => {
  const writes = await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const explore = page.getByRole("region", { name: "Explore", exact: true });
  const billboard = explore.getByRole("region", { name: "BrightWay billboard" });
  const launcher = explore.getByRole("group", { name: "Choose how to contribute" });
  expect(await page.locator(".bw-design-brand").evaluate(element => getComputedStyle(element).color)).toBe("rgb(0, 0, 0)");
  const post = launcher.getByRole("button", { name: "Create Post" });
  const achievement = launcher.getByRole("button", { name: "Share an Achievement" });
  const event = launcher.getByRole("button", { name: "Create an Event" });
  const question = launcher.getByRole("button", { name: "Ask a Question" });
  if (isMobile) {
    await expect(explore.locator(".bw-explore-billboard")).toBeHidden();
    await expect(explore.locator(".bw-post-quick-actions")).toBeHidden();
    const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
    const postShortcut = navigation.getByRole("link", { name: "Create Post" });
    await expect(postShortcut).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Explore" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Opportunities" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Network" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Learning" })).toBeVisible();
    const [shortcutBox, navBox] = await Promise.all([postShortcut.boundingBox(), navigation.boundingBox()]);
    expect(shortcutBox.y).toBeGreaterThanOrEqual(navBox.y);
    await postShortcut.click();
    const dialog = page.getByRole("dialog", { name: "Create a post", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Share an Achievement/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Create an Event/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Ask a Question/ })).toBeVisible();
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close post choices" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(postShortcut).toBeFocused();
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await testInfo.attach("Mobile Explore Post shortcut", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    return;
  }
  await expect(explore.getByRole("heading", { name: "Explore community" })).toHaveCount(1);
  await expect(explore.getByText("Discover what’s possible")).toHaveCount(0);
  await expect(explore.getByRole("navigation", { name: "Explore feed" }).getByRole("button", { name: "For You" })).toHaveAttribute("aria-pressed", "true");
  await expect(billboard.getByRole("heading", { name: "Find your next challenge" })).toBeVisible();
  await expect(billboard.getByRole("link", { name: "Browse opportunities" })).toHaveAttribute("href", "/opportunities");
  await expect(billboard.getByRole("button", { name: "Play slideshow" })).toBeVisible();
  await expect(launcher.getByRole("img", { name: "Your profile photo" })).toBeVisible();
  await expect(post).toHaveCount(0);
  for (const action of [achievement, event, question]) await expect(action).toBeVisible();
  await expect(explore.getByRole("button", { name: "Share a Post" })).toHaveCount(0);
  await expect(explore.getByRole("form", { name: "Create a post" })).toHaveCount(0);

  const card = explore.getByRole("article").first();
  await expect(card.getByText("Post", { exact: true })).toBeVisible();
  await expect(card.locator(".bw-post-story")).toHaveCount(0);
  for (const action of ["Comments", "Repost", "Like"]) {
    await expect(card.getByRole("button", { name: action, exact: true })).toBeVisible();
  }
  await expect(card.getByRole("button", { name: "Post options" })).toBeVisible();
  await card.getByRole("button", { name: "Post options" }).click();
  await expect(card.getByRole("menuitem", { name: "Save post" })).toBeVisible();
  await expect(card.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
  await expect(card.getByRole("menuitem", { name: "Report post" })).toBeVisible();
  await expect(card.getByRole("menuitem", { name: "Edit post" })).toHaveCount(0);
  await card.getByRole("button", { name: "Post options" }).click();
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
  test("Explore publishes tagged " + format.type.toLowerCase() + "s immediately", async ({ page, isMobile }, testInfo) => {
    const writes = await fixture(page);
    await page.goto("/explore");
    const explore = page.getByRole("region", { name: "Explore", exact: true });
    await openComposer(page, isMobile, format.choice);
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
    if (isMobile) await expect(explore.locator(".bw-post-quick-actions")).toBeHidden();
    else await expect(explore.getByRole("group", { name: "Choose how to contribute" })).toBeVisible();
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

test("achievement publishes immediately without AI screening", async ({ page, isMobile }) => {
  test.skip(isMobile, "Achievement quick actions are hidden on mobile Explore.");
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

test("event admission settings validate ticket price and capacity before publishing", async ({ page, isMobile }) => {
  test.skip(isMobile, "The mobile Explore composer launches a standard Post.");
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

test("achievement, event and question composers offer the same subject categories", async ({ page, isMobile }) => {
  test.skip(isMobile, "Specialized inline composer shortcuts remain on desktop Explore.");
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
  test.skip(isMobile, "Achievement shortcut is not shown on mobile Explore.");
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
  test.skip(isMobile, "Question shortcut is not shown on mobile Explore.");
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
  const typed = specializedFormats.map((format, index) => ({
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
  for (const format of specializedFormats) {
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
    await expect(card.getByRole("list", { name: "Topic tags" })).toHaveCount(0);
    await expect(card.getByLabel("Distribution topics")).toHaveCount(0);
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
  await expect(explanation.getByRole("list", { name: "Topic tags" })).toHaveCount(0);
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
  const [achievement, event, question] = specializedFormats.map((format, index) => ({
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
  await questionCard.getByRole("button", { name: "Post options" }).click();
  await questionCard.getByRole("menuitem", { name: "Report post" }).click();
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

test("question cards display real answerers and a distinct Answer action without visible topics", async ({ page }) => {
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
  await expect(card.getByRole("list", { name: "Topic tags" })).toHaveCount(0);
  const summary = card.getByLabel("Question answers");
  const facepile = summary.getByRole("group", { name: "Members who answered" });
  await expect(summary).toContainText("4 answers");
  await expect(facepile.getByRole("link")).toHaveCount(3);
  await expect(facepile.getByRole("link", { name: "Sam Brown answered" })).toHaveCount(0);
  await expect(facepile.getByRole("link", { name: "Maya Cole answered" })).toHaveAttribute("href", "/maya");
  await expect(facepile.getByRole("link", { name: "Alex Rivera answered" })).toContainText("AR");
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

test("the billboard rotates and stops when the member pauses it", async ({ page, isMobile }) => {
  test.skip(isMobile, "The Explore billboard is hidden on mobile.");
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


test("post and achievement footers keep engagement avatars opposite the actions on desktop and mobile", async ({ page, isMobile }) => {
  const regular = {
    ...fixturePost, id: "a9111111-1111-4111-8111-111111111111",
    type: "POST", tags: ["Education"], body: "An education resource shared with the community.",
    reaction: { liked: false, count: 2 }, repostCount: 1, commentCount: 3, views: 21,
  };
  const achievement = {
    ...fixturePost, id: "b9222222-2222-4222-8222-222222222222",
    type: "ACHIEVEMENT", tags: ["Coding"], body: "Completed a new coding project with my study group.",
    reaction: { liked: false, count: 4 }, repostCount: 1, commentCount: 2, views: 12,
  };
  await fixture(page, [regular, achievement]);
  const reports = [];
  await page.route("**/api/v1/explore/posts/member/*/engagers", route => route.fulfill({
    json: { success: true, data: { participants: [
      { username: "learner", name: "Learning Member", photoId: null, verified: true },
      { username: "teacher", name: "Teaching Member", photoId: null, verified: true },
    ] } },
  }));
  await page.route("**/api/v1/explore/posts/member/*/report", route => {
    reports.push({ path: new URL(route.request().url()).pathname, payload: route.request().postDataJSON() });
    return route.fulfill({ status: 201, json: { success: true, data: { reported: true } } });
  });
  await page.goto("/explore");
  const explore = page.getByRole("region", { name: "Explore", exact: true });
  if (isMobile) await expect(explore.getByRole("button", { name: "Refresh feed" })).toHaveCount(0);
  else await expect(explore.getByRole("button", { name: "Refresh feed" })).toBeVisible();
  for (const post of [regular, achievement]) {
    const card = explore.getByRole("article").filter({ hasText: post.body });
    await card.scrollIntoViewIfNeeded();
    const left = card.locator(".bw-post-engagement-left");
    const right = card.locator(".bw-post-secondary-actions");
    const faces = card.getByRole("group", { name: "Members who engaged with this post" });
    await expect(faces).toBeVisible();
    await expect(faces.getByRole("link")).toHaveCount(2);
    await expect(faces.getByRole("link", { name: "Learning Member engaged with this post" }))
      .toHaveAttribute("href", "/learner");
    await expect(card.getByRole("button", { name: "Comments" })).toBeVisible();
    await expect(card.getByRole("button", { name: post.type === "POST" ? "Like" : "Celebrate" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Repost" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Share" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Report post" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Post options" })).toBeVisible();
    await expect(right.getByLabel(/views$/)).toBeVisible();
    const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
    expect(leftBox).toBeTruthy();
    expect(rightBox).toBeTruthy();
    if (isMobile) expect(rightBox.x + rightBox.width).toBeLessThanOrEqual(leftBox.x + 1);
    else expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(rightBox.x + 1);
    expect(Math.abs(leftBox.y + leftBox.height / 2 - (rightBox.y + rightBox.height / 2)))
      .toBeLessThanOrEqual(10);
    await card.getByRole("button", { name: "Post options" }).click();
    await card.getByRole("menuitem", { name: "Report post" }).click();
    const report = card.getByRole("form", { name: "Report post" });
    await expect(report).toBeVisible();
    await report.getByRole("button", { name: "Submit report" }).click();
    await expect(card.getByText("Report submitted for moderation.")).toBeVisible();
  }
  expect(reports).toHaveLength(2);
  expect(reports.map(item => item.payload.reason)).toEqual(["SPAM", "SPAM"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (isMobile) {
    const regularCard = explore.getByRole("article").filter({ hasText: regular.body });
    const tray = regularCard.locator(".bw-post-secondary-actions");
    expect(await tray.evaluate(element => element.scrollWidth >= element.clientWidth)).toBe(true);
  }
});

test("event and organization post menus expose Report and keep it out of action footers", async ({ page }) => {
  const event = {
    ...fixturePost, id: "9e111111-1111-4111-8111-111111111111", type: "EVENT",
    body: "Join our career development workshop.",
    eventDetails: { title: "Career development workshop", startAt: "2027-01-15T12:00:00Z",
      endAt: "2027-01-15T14:00:00Z", format: "IN_PERSON", venue: "University campus" },
    registration: { registered: false, status: null, count: 0 }, eventAttendees: [],
    reaction: undefined, saved: false,
  };
  const organization = {
    id: "ab222222-2222-4222-8222-222222222222",
    name: "University Careers Office", username: "careers", profilePhotoId: null,
  };
  const announcement = {
    id: "ac333333-3333-4333-8333-333333333333",
    body: "Our institution is hosting a community learning session.",
    createdAt: fixturePost.createdAt, organization,
    reaction: { liked: false, count: 0 }, saved: false, reposted: false,
  };
  await fixture(page, [event, announcement]);
  const reports = [];
  await page.route("**/api/v1/explore/posts/*/*/report", route => {
    const url = new URL(route.request().url());
    reports.push({ source: url.pathname.split("/").at(-3), payload: route.request().postDataJSON() });
    return route.fulfill({ status: 201, json: { success: true, data: { reported: true } } });
  });
  await page.goto("/explore");
  for (const cardText of [event.body, announcement.body]) {
    const card = page.getByRole("article").filter({ hasText: cardText });
    await expect(card.getByRole("button", { name: "Report post" })).toHaveCount(0);
    await card.getByRole("button", { name: "Post options" }).click();
    const menu = card.getByRole("menu", { name: "Post options" });
    await expect(menu.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Save post" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Edit post" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Report post" }).click();
    const form = card.getByRole("form", { name: "Report post" });
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: "Submit report" }).click();
    await expect(card.getByText("Report submitted for moderation.")).toBeVisible();
  }
  expect(reports.map(report => report.source)).toEqual(["member", "organization"]);
  expect(reports.every(report => report.payload.reason === "SPAM")).toBe(true);
});

test("rich post cards render native image galleries, playable video and LinkedIn-style PDF pages", async ({ page, isMobile }) => {
  const id = kind => ({
    IMAGE: "aa111111-1111-4111-8111-111111111111",
    VIDEO: "bb222222-2222-4222-8222-222222222222",
    DOCUMENT: "cc333333-3333-4333-8333-333333333333",
  })[kind];
  const items = ["IMAGE", "VIDEO", "DOCUMENT"].map((kind, index) => ({
    ...fixturePost, id: ["dd111111-1111-4111-8111-111111111111",
      "dd222222-2222-4222-8222-222222222222",
      "dd333333-3333-4333-8333-333333333333"][index],
    body: "Rich media example " + kind, type: "POST", tags: ["Education"],
    media: [{ id: id(kind), kind, name: kind === "IMAGE" ? "project.webp" :
      kind === "VIDEO" ? "workshop.mp4" : "research-guide.pdf",
      contentType: kind === "IMAGE" ? "image/webp" : kind === "VIDEO" ? "video/mp4" : "application/pdf",
      size: 100, pageCount: kind === "DOCUMENT" ? 3 : null }],
  }));
  await fixture(page, items);
  const pdfBytes = await documentFixture();
  await page.route("**/api/v1/posts/media/*", route => route.fulfill(route.request().url().includes(id("DOCUMENT"))
    ? { contentType: "application/pdf", body: pdfBytes }
    : { contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#0866ff"/></svg>' }));
  await page.goto("/explore");
  const imageCard = page.getByRole("article").filter({ hasText: "Rich media example IMAGE" });
  const videoCard = page.getByRole("article").filter({ hasText: "Rich media example VIDEO" });
  const pdfCard = page.getByRole("article").filter({ hasText: "Rich media example DOCUMENT" });
  await expect(imageCard.getByRole("img", { name: "project.webp" })).toBeVisible();
  await expect(videoCard.locator("video[controls][playsinline]")).toHaveAttribute("src", /posts\/media\/bb222222/);
  const deck = pdfCard.getByRole("region", { name: "PDF document research-guide.pdf" });
  await expect(deck.getByText("research-guide", { exact: true })).toHaveCount(0);
  await deck.scrollIntoViewIfNeeded();
  await expect(deck.getByLabel("Page 1 of 3", { exact: true })).toBeVisible();
  await expect(deck.getByRole("group", { name: "Page 1", exact: true }).getByText("Document slide 1")).toBeAttached();
  await expect(deck.getByRole("link", { name: "Download document" })).toHaveAttribute("href", /^blob:/);
  await deck.getByRole("button", { name: "Next document page" }).click();
  await expect(deck.getByLabel("Page 2 of 3", { exact: true })).toBeVisible();
  await expect(deck.getByRole("group", { name: "Page 2", exact: true }).getByText("Document slide 2")).toBeAttached();
  await expect.poll(() => deck.locator(".bw-document-track").evaluate(element => Math.round(new DOMMatrix(getComputedStyle(element).transform).m41))).toBeLessThan(0);
  await expect(deck.locator("iframe")).toHaveCount(0);
  const secondCanvas = deck.getByRole("group", { name: "Page 2", exact: true }).locator("canvas");
  expect(await secondCanvas.evaluate(canvas => {
    const [r,g,b] = canvas.getContext("2d").getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    return g > r * 2 && g > b * 2;
  })).toBe(true);
  await deck.getByRole("button", { name: "Expand document" }).click();
  const expanded = page.getByRole("dialog", { name: "Document viewer research-guide.pdf" });
  await expect(expanded.getByLabel("Page 2 of 3", { exact:true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(expanded.getByLabel("Page 3 of 3", { exact:true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(expanded).toHaveCount(0);
  await expect(deck.getByRole("button", { name: "Expand document" })).toBeFocused();
  await deck.getByRole("button", { name: "Previous document page" }).click();

  await deck.getByRole("button", { name: "Next document page" }).click();
  await expect(deck.getByRole("button", { name: "Next document page" })).toBeDisabled();
  await deck.getByRole("button", { name: "Previous document page" }).click();
  await expect(deck.getByLabel("Page 2 of 3", { exact: true })).toBeVisible();
  if (isMobile) {
    const rect = await imageCard.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.width).toBeGreaterThanOrEqual(page.viewportSize().width - 2);
    expect(await imageCard.evaluate(card => getComputedStyle(card).borderRadius)).toBe("0px");
    expect(await imageCard.evaluate(card => getComputedStyle(card).boxShadow)).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test("member composer uploads a PDF and binds its ID to the published post", async ({ page, isMobile }) => {
  const writes = await fixture(page);
  const uploads = [];
  const mediaId = "ff444444-4444-4444-8444-444444444444";
  await page.route("**/api/v1/posts/me/media?*", async route => {
    uploads.push({ type: route.request().headers()["content-type"], bytes: route.request().postDataBuffer() });
    return route.fulfill({ status: 201, json: { success: true, data: {
      id: mediaId, kind: "DOCUMENT", name: "learning-notes.pdf", size: uploads.at(-1).bytes.length,
      contentType: "application/pdf", pageCount: 2,
    } } });
  });
  const previewPdf = await documentFixture();
  await page.route("**/api/v1/posts/media/" + mediaId, route => route.fulfill({ contentType:"application/pdf", body:previewPdf }));
  await page.goto("/explore");
  await openComposer(page, isMobile);
  const dialog = page.getByRole("dialog", { name: "Share an Achievement" });
  await dialog.locator('input[type="file"][accept="application/pdf"]').setInputFiles({
    name: "learning-notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nsynthetic-content"),
  });
  await expect(dialog.getByRole("list", { name: "Uploaded attachments" })).toContainText("learning-notes.pdf");
  await expect(dialog.getByRole("button", { name: "Remove attachment learning-notes.pdf" })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Write an achievement" }).fill("This PDF summarizes our community research.");
  const topics = dialog.getByRole("textbox", { name: "Topics" });
  await topics.fill("Research"); await topics.press("Enter");
  await dialog.getByRole("button", { name: "Publish achievement" }).click();
  await expect(dialog).toHaveCount(0);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].type).toBe("application/pdf");
  expect(writes).toEqual([expect.objectContaining({
    body: "This PDF summarizes our community research.", type: "ACHIEVEMENT",
    mediaIds: [mediaId],
  })]);
});

test("post photo galleries open an accessible viewer and keep mobile images edge to edge", async ({ page, isMobile }) => {
  const media = Array.from({ length: 4 }, (_, index) => ({
    id: "gallery-photo-" + index, kind: "IMAGE", name: "community-" + index + ".webp", size: 100,
  }));
  await fixture(page, [{ ...fixturePost, type: "POST", media }]);
  await page.route("**/api/v1/posts/media/gallery-photo-*", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#0866ff"/></svg>',
  }));
  await page.goto("/explore");
  const gallery = page.getByRole("group", { name: "Post photos" });
  const trigger = gallery.getByRole("button", { name: "Open photo 2 of 4: community-1.webp" });
  await trigger.click();
  const postViewer = page.getByRole("dialog", { name: "Post viewer" });
  await expect(postViewer).toBeVisible();
  const photoTrigger = postViewer.getByRole("button", { name: "Open photo 2 of 4: community-1.webp" });
  await photoTrigger.click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer.getByText("2 of 4")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Close photo viewer" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("3 of 4")).toBeVisible();
  await viewer.getByRole("button", { name: "View photo 4" }).click();
  await expect(viewer.getByRole("button", { name: "Next photo" })).toBeDisabled();
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(viewer.getByRole("button", { name: "Zoom out" })).toHaveAttribute("aria-pressed", "true");
  // Native modal focus must stay inside the viewer even at the tab boundary.
  await viewer.getByRole("button", { name: "View photo 4" }).focus();
  await page.keyboard.press("Tab");
  expect(await viewer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(photoTrigger).toBeFocused();
  await postViewer.getByRole("button", { name: "Close post viewer" }).click();
  await expect(page.getByRole("article").first()).toBeFocused();
  if (isMobile) {
    const bounds = await gallery.boundingBox();
    expect(Math.abs(bounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.width - page.viewportSize().width)).toBeLessThanOrEqual(2);
    expect(await gallery.evaluate(element => getComputedStyle(element).borderRadius)).toBe("0px");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("photo preview closes without discarding the post editor or its uploaded images", async ({ page, isMobile }) => {
  await fixture(page);
  await page.route("**/api/v1/posts/me/media?*", route => route.fulfill({ status: 201, json: {
    success: true, data: { id: "preview-photo", kind: "IMAGE", name: "study-group.webp", size: 100 },
  } }));
  await page.route("**/api/v1/posts/media/preview-photo", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="#0866ff"/></svg>',
  }));
  await page.goto("/explore");
  await openComposer(page, isMobile);
  const editor = page.getByRole("dialog", { name: "Share an Achievement", exact: true });
  await editor.getByRole("textbox", { name: "Write an achievement" }).fill("Our study group’s latest achievement.");
  await editor.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: "study-group.webp", mimeType: "image/webp", buffer: Buffer.from("synthetic image upload"),
  });
  const open = editor.getByRole("button", { name: "Open photo 1 of 1: study-group.webp" });
  await open.click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await viewer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(open).toBeFocused();
  await expect(editor.getByRole("textbox", { name: "Write an achievement" })).toHaveValue("Our study group’s latest achievement.");
  await expect(editor.getByText("1 of 4 added")).toBeVisible();
});

test("mixed photo collages anchor every preview at the top and follow the first photo orientation", async ({ page }) => {
  const sets = [
    { name: "Mixed pair", sizes: [[800, 1200], [1600, 800]], layout: "pair" },
    { name: "Wide first three", sizes: [[1600, 900], [800, 1200], [1000, 1000]], layout: "landscape" },
    { name: "Wide first four", sizes: [[1600, 900], [800, 1200], [1000, 1000], [1600, 900]], layout: "landscape" },
    { name: "Tall first four", sizes: [[800, 1200], [1600, 900], [1000, 1000], [800, 1200]], layout: "portrait" },
  ];
  await fixture(page, sets.map((set, index) => ({ ...fixturePost, id: "framing-post-" + index, body: set.name, type: "POST",
    media: set.sizes.map((_, photo) => ({ id: `frame-${index}-${photo}`, kind: "IMAGE", name: `photo-${photo}.webp`, size: 100 })),
  })));
  await page.route("**/api/v1/posts/media/frame-*", route => {
    const [, set, photo] = new URL(route.request().url()).pathname.split("/").at(-1).split("-");
    const [width, height] = sets[Number(set)].sizes[Number(photo)];
    return route.fulfill({ contentType: "image/svg+xml", body:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0866ff"/><rect width="100%" height="120" fill="#ff5050"/><text x="20" y="70" font-size="40">TOP</text></svg>` });
  });
  await page.goto("/explore");
  for (const set of sets) {
    const gallery = page.getByRole("article").filter({ hasText: set.name }).getByRole("group", { name: "Post photos" });
    await gallery.scrollIntoViewIfNeeded();
    await expect(gallery).toHaveAttribute("data-layout", set.layout);
    for (const image of await gallery.getByRole("img").all()) {
      await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
      expect(await image.evaluate(element => getComputedStyle(element).objectPosition)).toBe("50% 0%");
      if (set.layout === "pair") expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe("contain");
    }
    const tiles = await gallery.locator(".bw-photo-gallery-tile").all();
    const boxes = await Promise.all(tiles.map(tile => tile.boundingBox()));
    if (set.layout === "landscape") {
      expect(boxes[0].y + boxes[0].height).toBeLessThan(boxes[1].y);
      expect(Math.abs(boxes[1].y - boxes.at(-1).y)).toBeLessThan(1);
    } else {
      expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1);
      expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
    }
    expect(await gallery.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  }
});

test("mobile shell keeps search in one row and opens a contained account drawer", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "Mobile shell geometry and native drawer interaction.");
  await fixture(page);
  await page.goto("/explore");
  const header = page.locator(".bw-design-header");
  const accountButton = header.getByRole("button", { name: "Open account menu" });
  await expect(page).toHaveTitle("Brightway - Learn, Network and Earn");
  await expect(accountButton.locator("svg path")).toHaveAttribute("d", "M4 7h16M4 12h16M4 17h16");
  await expect(accountButton.locator("svg")).toHaveAttribute("width", "32");
  const menuSize = await accountButton.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(menuSize).toEqual({ width: 44, height: 44 });
  const search = header.getByRole("searchbox", { name: "Search BrightWay content and people" });
  const messages = header.getByRole("link", { name: "Messages", exact: true });
  for (const width of [320, 390, 700]) {
    await page.setViewportSize({ width, height: 844 });
    const [avatar, field, message, bar] = await Promise.all([
      accountButton.boundingBox(), (width < 360 ? header.getByRole("link", { name: "Search BrightWay", exact:true }) : search).boundingBox(), messages.boundingBox(), header.boundingBox(),
    ]);
    expect(message.x + message.width).toBeLessThan(avatar.x);
    expect(field.x + field.width).toBeLessThan(message.x);
    expect(Math.abs(avatar.y + avatar.height / 2 - (field.y + field.height / 2))).toBeLessThan(2);
    expect(bar.height).toBeLessThanOrEqual(64);
    if (width >= 360) expect(await search.evaluate(element => getComputedStyle(element).fontSize)).toBe("16px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const post = page.locator(".bw-timeline-post").first();
  const caption = post.locator(".bw-post-caption");
  const [cardBox, textBox] = await Promise.all([post.boundingBox(), caption.boundingBox()]);
  expect(textBox.x - cardBox.x).toBeLessThanOrEqual(13);
  expect(cardBox.width - textBox.width).toBeLessThanOrEqual(25);
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(navigation.getByRole("link", { name: "Notifications", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  expect(await navigation.getByRole("link", { name: "Explore", exact: true }).evaluate(element => getComputedStyle(element).color)).toBe("rgb(23, 92, 211)");
  await accountButton.click();
  const drawer = page.getByRole("dialog", { name: "Account menu", exact: true });
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate(element => element.matches(":modal"))).toBe(true);
  expect(await page.locator("body").evaluate(element => element.style.overflow)).toBe("hidden");
  await testInfo.attach("Mobile account drawer", { body: await page.screenshot(), contentType: "image/png" });
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(accountButton).toBeFocused();
  expect(await page.locator("body").evaluate(element => element.style.overflow)).toBe("");
  await accountButton.click();
  await page.getByRole("dialog", { name: "Account menu", exact: true }).getByRole("button", { name: "Close account menu" }).click();
  await expect(accountButton).toBeFocused();
  await page.getByRole("link", { name: "Create Post" }).click();
  const chooser = page.getByRole("dialog", { name: "Create a post", exact: true });
  const sheet = await chooser.boundingBox();
  expect(sheet.x).toBe(0);
  expect(sheet.width).toBe(390);
  expect(Math.round(sheet.y + sheet.height)).toBe(844);
  await chooser.getByRole("button", { name: "Close post choices" }).click();
  await testInfo.attach("Mobile feed refresh", { body: await page.screenshot(), contentType: "image/png" });
});


test("immersive post viewer opens from a feed card, browses vertically and restores focus", async ({ page, isMobile }, testInfo) => {
  const first = {
    ...fixturePost,
    id: "d1111111-1111-4111-8111-111111111111",
    body: "A research milestone that deserves a closer look.",
    type: "ACHIEVEMENT",
    tags: ["Research"], views: 18, commentCount: 0,
  };
  const second = {
    ...fixturePost,
    id: "d2222222-2222-4222-8222-222222222222",
    body: "What should our study group build next?",
    type: "QUESTION",
    tags: ["Learning"], views: 7,
    questionDetails: { title: "What should our study group build next?", intent: "GUIDANCE" },
  };
  await fixture(page, [first, second]);
  await page.goto("/explore");
  const card = page.getByRole("article").filter({ hasText: first.body }).first();
  const opener = card;
  await expect(card.getByRole("button", { name: "Open post viewer" })).toHaveCount(0);
  await expect(opener).toBeVisible();
  await card.locator(".bw-post-text").click();
  const viewer = page.getByRole("dialog", { name: "Post viewer" });
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(new RegExp("post=" + first.id));
  await expect(viewer.getByRole("article", { name: "Maya Cole post" })).toContainText(first.body);
  await expect(viewer.getByRole("button", { name: "Previous post" })).toBeDisabled();
  await expect(viewer.getByRole("button", { name: "Next post" })).toBeEnabled();
  await expect(viewer.getByRole("button", { name: "Celebrate" })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(viewer.getByLabel("Distribution topics")).toHaveCount(0);
  await viewer.getByRole("button", { name: "Post options" }).click();
  await expect(viewer.getByRole("menuitem", { name: "Save post" })).toBeVisible();
  await viewer.getByRole("button", { name: "Post options" }).click();

  await testInfo.attach("Post viewer reading layout", { body: await page.screenshot(), contentType: "image/png" });
  if (isMobile) {
    const bounds = await viewer.boundingBox();
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(Math.abs(bounds.width - page.viewportSize().width)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.height - page.viewportSize().height)).toBeLessThanOrEqual(2);
    const slide = viewer.locator(".bw-post-viewer-slide");
    await slide.evaluate(element => {
      const origin = new Touch({ identifier: 7, target: element, clientX: 185, clientY: 690 });
      const moved = new Touch({ identifier: 7, target: element, clientX: 184, clientY: 300 });
      element.dispatchEvent(new TouchEvent("touchstart", {
        bubbles: true, touches: [origin], changedTouches: [origin], targetTouches: [origin],
      }));
      element.dispatchEvent(new TouchEvent("touchend", {
        bubbles: true, touches: [], changedTouches: [moved], targetTouches: [],
      }));
    });
  } else await viewer.getByRole("button", { name: "Next post" }).click();

  await expect(page).toHaveURL(new RegExp("post=" + second.id));
  await expect(viewer.getByRole("article", { name: "Maya Cole post" })).toContainText(second.body);
  await expect(viewer.getByRole("button", { name: "Answers" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Answer", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(new RegExp("post=" + first.id));
  await viewer.getByRole("button", { name: "Close post viewer" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(/\/explore$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("shared post links open the viewer directly without losing the normal feed", async ({ page }) => {
  const direct = {
    ...fixturePost,
    id: "d3333333-3333-4333-8333-333333333333",
    body: "Community research post linked from another page.",
    type: "POST",
    tags: ["Community"], views: 6,
  };
  await fixture(page, [direct]);
  await page.goto("/explore?source=member&post=" + direct.id);
  const viewer = page.getByRole("dialog", { name: "Post viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("article", { name: "Maya Cole post" })).toContainText(direct.body);
  await viewer.getByRole("button", { name: "Close post viewer" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("region", { name: "Explore posts" }).getByRole("article").filter({ hasText: direct.body })).toBeVisible();
});


test("post keyboard entry and nested controls stay independent", async ({ page }) => {
  await fixture(page, [{ ...fixturePost, type: "ACHIEVEMENT", tags: ["Research"], views: 18 }]);
  await page.route("**/api/v1/explore/posts/member/*/like", route => route.fulfill({ json: {
    success: true, data: { reaction: { liked: true, count: 4 } },
  } }));
  await page.goto("/explore");
  const card = page.getByRole("article", { name: "Post by Maya Cole" });
  await card.getByRole("button", { name: "Celebrate" }).click();
  await expect(card.getByRole("button", { name: "Celebrate" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog", { name: "Post viewer" })).toHaveCount(0);
  await card.getByRole("button", { name: "Post options" }).click();
  await expect(card.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await card.focus();
  await page.keyboard.press("Enter");
  const viewer = page.getByRole("dialog", { name: "Post viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Close post viewer" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();
  await page.keyboard.press("Space");
  await expect(viewer).toBeVisible();
  await page.goBack();
  await expect(viewer).toHaveCount(0);
  await expect(card).toBeFocused();
});

test("viewer keeps long captions readable and owner edit dialogs accessible", async ({ page, isMobile }, testInfo) => {
  const owned = { ...fixturePost, type: "ACHIEVEMENT", tags: ["Research"],
    body: "Research progress from our community team. ".repeat(35),
    member: { name: "Synthetic Member", username: "synthetic", verified: true } };
  await fixture(page, [owned]);
  await page.goto("/explore");
  const card = page.getByRole("article", { name: "Post by Synthetic Member" });
  await card.locator(".bw-post-type-label").click();
  const viewer = page.getByRole("dialog", { name: "Post viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator(".bw-post-text")).toHaveText(owned.body.trim());
  await expect(viewer.getByRole("button", { name: "See more" })).toHaveCount(0);
  expect(await viewer.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const summary = viewer.locator(".bw-immersive-post-bottom");
  expect(await summary.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await viewer.getByRole("button", { name: "Post options" }).click();
  await viewer.getByRole("menuitem", { name: "Edit post" }).click();
  const editor = page.getByRole("dialog", { name: "Edit post", exact: true });
  await expect(editor.getByRole("textbox", { name: "Post description" })).toBeFocused();
  await editor.getByRole("textbox", { name: "Post description" }).fill("A draft correction.");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "Close post viewer" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await card.locator(".bw-post-type-label").click();
  await expect(viewer).toBeVisible();
  expect(await viewer.locator(".bw-post-viewer-slide").evaluate(el => el.getAnimations().length)).toBe(0);
  await testInfo.attach(isMobile ? "Mobile reading view" : "Desktop reading view", { body: await page.screenshot(), contentType: "image/png" });
});

test("published opportunities join the main Explore feed and remain separate from post viewer actions", async ({ page }) => {
  const organizationId = "55555555-5555-4555-8555-555555555555";
  const opportunityId = "66666666-6666-4666-8666-666666666666";
  const listing = { id: opportunityId, type: "JOB", title: "Research assistant opportunity",
    description: "Join a research team and build professional skills.", location: "Monrovia",
    workMode: "IN_PERSON", publishedAt: "2026-11-13T12:00:00Z", createdAt: "2026-11-12T12:00:00Z",
    status: "PUBLISHED", deadline: "2099-01-01T12:00:00Z", followed: false,
    organization: { id: organizationId, name: "Community Research Institute", verifiedAt: "2026-11-01T12:00:00Z", profilePhotoId: "org-photo-1" } };
  await fixture(page, [fixturePost], "PUBLISHED", null, [listing]);
  await page.goto("/explore");
  const feed = page.getByRole("region", { name: "Explore posts" });
  const card = feed.getByRole("article", { name: "Job opportunity: Research assistant opportunity" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("img", { name: "Verified organization" })).toBeVisible();
  await expect(card.getByRole("img", { name: "Community Research Institute profile picture" })).toHaveAttribute("src", /\/api\/v1\/organizations\//);
  await expect(card.locator(".bw-post-publisher-name").getByRole("link", { name: "Community Research Institute" })).toHaveAttribute("href", "/organizations/" + organizationId);
  await expect(card.getByRole("link", { name: "Research assistant opportunity" })).toHaveAttribute("href", "/opportunities/" + opportunityId);
  await expect(card.getByRole("link", { name: "Apply on BrightWay" })).toHaveAttribute("href", "/opportunities/" + opportunityId);
  await expect(card.getByRole("button", { name: "Post options" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Like" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Explore feed" }).getByRole("button", { name: "Saved" }).click();
  await expect(feed.getByRole("article", { name: "Job opportunity: Research assistant opportunity" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Explore feed" }).getByRole("button", { name: "Following" }).click();
  await expect(feed.getByRole("article", { name: "Job opportunity: Research assistant opportunity" })).toHaveCount(0);
});

test("main Explore feed displays the four opportunity categories with white opportunity cards", async ({ page }) => {
  const organizationId = "55555555-5555-4555-8555-555555555555";
  const categories = [
    { type: "JOB", label: "Job", heading: "Jobs & Internships", action: "Apply" },
    { type: "SCHOLARSHIP", label: "Scholarship", heading: "Scholarships", action: "Apply" },
    { type: "CHALLENGE", label: "Challenge", heading: "Challenges & Competitions", action: "Participate" },
    { type: "EVENT", label: "Event", heading: "Events", action: "Register" },
  ];
  const opportunities = categories.map((category, index) => ({
    id: "66666666-6666-4666-8666-66666666666" + index,
    type: category.type,
    title: category.heading + " listing",
    description: "A verified opportunity for BrightWay members.",
    location: "Monrovia",
    workMode: "IN_PERSON",
    publishedAt: "2026-11-13T12:00:00Z",
    createdAt: "2026-11-12T12:00:00Z",
    status: "PUBLISHED",
    deadline: "2099-01-01T12:00:00Z",
    organization: { id: organizationId, name: "Community Research Institute", verifiedAt: "2026-11-01T12:00:00Z", profilePhotoId: "org-photo-1" },
  }));
  await fixture(page, [], "PUBLISHED", null, opportunities);
  await page.goto("/explore");

  const feed = page.getByRole("region", { name: "Explore posts" });

  for (const category of categories) {
    const card = feed.getByRole("article", { name: category.label + " opportunity: " + category.heading + " listing" });
    await expect(card).toBeVisible();
    await expect(card.locator(".bw-timeline-opportunity-category")).toContainText(category.heading);
    await expect(card.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/opportunities?type=" + category.type);
    await expect(card.locator(".bw-timeline-opportunity-card")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(card.getByRole("img", { name: "Verified organization" })).toBeVisible();
    await expect(card.getByRole("link", { name: category.action + " on BrightWay" }))
      .toHaveAttribute("href", /\/opportunities\/66666666-/);
    const background = await card.evaluate(element => getComputedStyle(element).backgroundImage);
    expect(background).toBe("none");

  }

  await expect(feed.getByText("Grants & Funding")).toHaveCount(0);
});

test("desktop avatar menu uses a large circular hover target", async ({ page, isMobile }) => {
  test.skip(isMobile, "Hover styling is checked on desktop; mobile target size is covered separately.");
  await fixture(page);
  await page.goto("/explore");
  const menu = page.locator(".bw-design-header").getByRole("button", { name: "Open account menu" });
  const dimensions = await menu.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(dimensions).toEqual({ width: 44, height: 44 });
  await expect(menu.locator("svg")).toHaveAttribute("width", "32");
  await menu.hover();
  await expect(menu).toHaveCSS("background-color", "rgb(240, 241, 242)");
  await expect(menu).toHaveCSS("border-radius", "50%");
});

test("Challenge Explore card prioritizes title, verified organizer, deadline, prize and mode, with working save", async ({ page, isMobile }) => {
  const opportunityId = "77777777-7777-4777-8777-777777777777";
  const organizationId = "55555555-5555-4555-8555-555555555555";
  const opportunity = {
    id: opportunityId, type: "CHALLENGE", title: "Build a Community Learning App",
    description: "Design a useful student learning experience.", location: "Monrovia",
    workMode: "REMOTE", prize: "US$1,000", saved: false, status: "PUBLISHED",
    deadline: "2099-01-01T12:00:00Z", publishedAt: "2026-11-13T12:00:00Z",
    createdAt: "2026-11-12T12:00:00Z", organization: {
      id: organizationId, name: "Community Research Institute",
      profilePhotoId: "org-photo-1", verifiedAt: "2026-11-01T12:00:00Z",
    },
  };
  await fixture(page, [], "PUBLISHED", null, [opportunity]);
  await page.goto("/explore");

  const feed = page.getByRole("region", { name: "Explore posts" });
  const card = feed.getByRole("article", { name: "Challenge opportunity: Build a Community Learning App" });
  await expect(card).toBeVisible();
  // Brightway.me's actual reference wraps the white compact card in a
  // 16px-padded category container; it has no full-height cover.
  const heading = card.locator(".bw-timeline-opportunity-category");
  const body = card.locator(".bw-challenge-card");
  const shell = await card.evaluate(element => {
    const style = getComputedStyle(element);
    return { padding: style.paddingTop, background: style.backgroundImage };
  });
  expect(shell.padding).toBe(isMobile ? "12px" : "16px");
  expect(shell.background).toBe("none");
  await expect(body).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(await body.evaluate(element => getComputedStyle(element).paddingTop))
    .toBe(isMobile ? "12px" : "16px");
  expect(await heading.evaluate(element => getComputedStyle(element).minHeight)).toBe("0px");
  const avatarWidth = await card.locator(".bw-challenge-organization-avatar")
    .evaluate(element => element.getBoundingClientRect().width);
  expect(avatarWidth).toBe(isMobile ? 40 : 45);
  const innerElementsWithTopMargins = await body.locator("*").evaluateAll(elements =>
    elements.filter(element =>
      !element.classList.contains("bw-challenge-divider") &&
      getComputedStyle(element).marginTop !== "0px")
      .map(element => ({ tag: element.tagName, className: element.getAttribute("class"),
        marginTop: getComputedStyle(element).marginTop })));
  expect(innerElementsWithTopMargins).toEqual([]);
  const dividerMargin = await card.locator(".bw-challenge-divider")
    .evaluate(element => getComputedStyle(element).marginTop);
  expect(dividerMargin).toBe("16px");
  const title = card.getByRole("heading", { name: opportunity.title });
  const organizer = card.locator(".bw-challenge-organization");
  const deadline = card.locator(".bw-challenge-deadline");
  const prize = card.locator(".bw-challenge-prize");
  await expect(card.getByRole("img", { name: "Verified organization" })).toBeVisible();
  await expect(organizer.getByRole("link", { name: opportunity.organization.name, exact: true })).toHaveAttribute("href", "/organizations/" + organizationId);
  await expect(deadline).toContainText("Deadline:");
  await expect(prize).toContainText("US$1,000");
  await expect(prize).toContainText("Online");
  await expect(title).toHaveCSS("margin-bottom", "2px");
  await expect(prize).toHaveCSS("row-gap", "1px");
  const [prizeAmountBounds, modeBounds] = await Promise.all([
    prize.locator("strong").boundingBox(),
    prize.locator(".bw-challenge-mode").boundingBox(),
  ]);
  expect(modeBounds.y - (prizeAmountBounds.y + prizeAmountBounds.height)).toBeLessThanOrEqual(2);
  const [titleBounds, organizerBounds, deadlineBounds, prizeBounds] = await Promise.all([
    title.boundingBox(), organizer.boundingBox(), deadline.boundingBox(), prize.boundingBox(),
  ]);
  expect(titleBounds.y).toBeLessThan(organizerBounds.y);
  expect(organizerBounds.y - (titleBounds.y + titleBounds.height)).toBeLessThanOrEqual(3);
  expect(organizerBounds.y).toBeLessThan(deadlineBounds.y);
  expect(prizeBounds.x).toBeGreaterThan(organizerBounds.x);
  await expect(card.locator(".bw-challenge-divider")).toHaveCount(1);
  await expect(card.getByRole("link", { name: "Participate on BrightWay" })).toHaveAttribute("href", "/opportunities/" + opportunityId);
  const [participateBounds, actionsBounds] = await Promise.all([
    card.getByRole("link", { name: "Participate on BrightWay" }).boundingBox(),
    card.locator(".bw-challenge-secondary").boundingBox(),
  ]);
  expect(participateBounds.x + participateBounds.width).toBeLessThanOrEqual(actionsBounds.x + 1);
  await expect(card.getByRole("button", { name: "Share challenge" })).toBeVisible();
  await expect(card.getByRole("link", { name: "View challenge" })).toHaveAttribute("href", "/opportunities/" + opportunityId);
  const save = card.getByRole("button", { name: "Save challenge" });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(card.getByRole("button", { name: "Unsave challenge" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("navigation", { name: "Explore feed" }).getByRole("button", { name: "Saved" }).click();
  await expect(feed.getByRole("article", { name: "Challenge opportunity: Build a Community Learning App" })).toBeVisible();
  await page.reload();
  const savedCard = feed.getByRole("article", { name: "Challenge opportunity: Build a Community Learning App" });
  await expect(savedCard.getByRole("button", { name: "Unsave challenge" })).toBeVisible();
  await savedCard.getByRole("button", { name: "Unsave challenge" }).click();
  await expect(savedCard).toHaveCount(0);
  const root = page.locator("html");
  expect(await root.evaluate(element => element.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
