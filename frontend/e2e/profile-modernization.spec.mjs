import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4187";
const account = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "synthetic",
  email: "synthetic@example.org",
  person: { id: "22222222-2222-4222-8222-222222222222", firstName: "Synthetic", lastName: "Member" },
};
const profile = {
  id: "33333333-3333-4333-8333-333333333333",
  version: 1, photo: null,
  headline: "Learning software development",
  bio: "Building practical tools for education.",
  location: { countryCode: "LR", region: "Montserrado", locality: "Monrovia" },
  careerField: { mode: "EXPLORING" }, careerGoals: "Create useful software.",
  skills: ["Communication"], interests: ["Technology"],
  education: { mode: "NONE", records: [] },
  experience: { mode: "NONE", records: [] },
  contact: { email: account.email, emailVerifiedAt: null, phoneNumber: null,
    whatsappNumber: null, visibility: { email: "ONLY_ME", phone: "ONLY_ME", whatsapp: "ONLY_ME" } },
  profilePublicEnabled: false, profileViewSharingEnabled: false,
  profileViewNotificationsEnabled: false,
  completion: { profileVersion: 1, complete: false, eligibleToRequestVerification: false,
    checks: [
      { code: "SKILL_REQUIRED", label: "At least one skill", editor: "skills", satisfied: true },
      { code: "PHONE_REQUIRED", label: "Phone number", editor: "contact", satisfied: false },
      { code: "EMAIL_VERIFICATION_REQUIRED", label: "Verified email", editor: "email", satisfied: false },
    ] },
};
const published = {
  username: "maya", fullName: "Maya Cole", headline: "Software developer and mentor",
  bio: "Helping students create their first projects.",
  location: { countryCode: "LR", region: "Montserrado", locality: "Monrovia" },
  careerField: { mode: "SPECIFIED", label: "Software development" },
  careerGoals: "Make technology education accessible.",
  skills: ["React", "TypeScript"], interests: ["Education"],
};

async function fixture(page, profileOverrides = {}, publishedOverrides = {}, activityCaption = "Finished a community coding project.", memberOverride = {}, showDiscussionPhotos = false) {
  let privateReads = 0;
  let publicViews = 0;
  let activityReads = 0;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    // An oversized source image exposes unbounded avatar CSS in real browsers.
    if (showDiscussionPhotos && /^\/api\/v1\/explore\/members\/[^/]+\/photo\/[^/]+$/.test(url.pathname)) {
      return route.fulfill({
        status: 200, contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800"><rect width="1200" height="1800" fill="#4169a6"/></svg>',
      });
    }
    const reply = data => route.fulfill({ json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/profile/me":
        privateReads++;
        return reply({ profile: { ...profile, ...profileOverrides } });
      case "/api/v1/profile/me/dashboard":
        return reply({ periodDays: 7, profileViews: 9, postImpressions: 0, searchAppearances: 6 });
      case "/api/v1/posts/me":
        activityReads++;
        return reply(url.searchParams.has("cursor")
          ? { access: {}, items: [{
            id: "33333333-3333-4333-8333-333333333333", type: "QUESTION",
            body: "How do I find a mentor?", createdAt: "2026-11-07T09:00:00Z",
            questionDetails: { title: "Finding a mentor" }, tags: ["Learning"],
            member: { username: "synthetic", name: "Synthetic Member", photoId: null, verified: true, ...memberOverride },
            reaction: { count: 0, liked: false }, views: 3, commentCount: 0,
            repostCount: 0, answerCount: 2,
            answerParticipants: showDiscussionPhotos ? [{
              name: "Answering Member", username: "answerer", photoId: "answer-photo",
              verified: true,
            }] : [],
            saved: false, reposted: false,
          }], nextCursor: null }
          : { access: {}, items: [
            { id: "11111111-1111-4111-8111-111111111111", type: "ACHIEVEMENT",
              body: activityCaption, createdAt: "2026-11-09T09:00:00Z",
              tags: ["Coding"],
              member: { username: "synthetic", name: "Synthetic Member", photoId: null, verified: true, ...memberOverride },
              reaction: { count: 4, liked: false }, views: 28, commentCount: 2,
              repostCount: 1, saved: false, reposted: false,
            },
            { id: "22222222-2222-4222-8222-222222222222", type: "EVENT",
              body: "Join our community workshop.", createdAt: "2026-11-08T09:00:00Z",
              eventDetails: { title: "Community workshop", startAt: "2026-11-12T14:00:00Z",
                endAt: "2026-11-12T16:00:00Z", timezone: "Africa/Monrovia",
                format: "IN_PERSON", venue: "Monrovia", ticketPriceCents: 0,
                requiresApproval: false, capacity: 50 },
              tags: ["Career"],
              member: { username: "synthetic", name: "Synthetic Member", photoId: null, verified: true, ...memberOverride },
              reaction: { count: 0, liked: false }, views: 9, commentCount: 1,
              repostCount: 0, registration: { count: 6, registered: false },
              eventAttendees: [], saved: false, reposted: false,
            },
          ], nextCursor: "older" });
      case "/api/v1/explore/posts/member/11111111-1111-4111-8111-111111111111/comments":
        return reply({ items: showDiscussionPhotos ? [{
          id: "comment-1", name: "Commenting Member", username: "commenter",
          photoId: "comment-photo", verified: true,
          body: "Very helpful achievement.", createdAt: "2026-11-09T10:00:00Z",
          canDelete: false,
        }] : [], nextCursor: null });
      case "/api/v1/explore/posts/member/33333333-3333-4333-8333-333333333333/answers":
        return reply({ items: showDiscussionPhotos ? [{
          id: "answer-1", name: "Answering Member", username: "answerer",
          photoId: "answer-photo", verified: true,
          body: "Find a mentor through purposeful projects.",
          createdAt: "2026-11-09T10:00:00Z", upvoteCount: 1,
          downvoteCount: 0, commentCount: 0, myVote: 0, canDelete: false,
        }] : [] });
      case "/api/v1/manual-identity/status":
        return reply({ accountId: account.id, profileVersion: 1, status: "NOT_STARTED",
          identityVerified: false, canSubmit: false });
      case "/api/v1/profiles/maya/view":
        publicViews++;
        return reply({ ...published, ...publishedOverrides });
      default: return reply({});
    }
  });
  return { privateReads: () => privateReads, publicViews: () => publicViews,
    activityReads: () => activityReads };
}

test("my profile has three responsive tabs below the private dashboard on desktop and mobile", async ({ page }) => {
  const api = await fixture(page);
  await page.goto("/profile");
  const heading = page.getByRole("heading", { level: 1, name: "Synthetic Member" });
  await expect(heading).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Profile sections" });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(tabs.getByRole("tab", { name: "About Me" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Achievements" })).toHaveAttribute("aria-selected", "false");
  await expect(tabs.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "false");
  const dashboard = page.locator("#profile-dashboard");
  await expect(dashboard).toBeVisible();
  await expect(dashboard.getByText("Private to you")).toBeVisible();
  await expect(dashboard.getByRole("button", { name: /9.*Profile views/ })).toBeVisible();
  await expect(dashboard.getByRole("button", { name: /0.*Post impressions/ })).toBeVisible();
  await expect(dashboard.getByRole("button", { name: /6.*Search appearances/ })).toBeVisible();
  await expect(page.locator("#profile-about")).toBeVisible();
  expect(await dashboard.evaluate(element => element.compareDocumentPosition(document.getElementById("profile-about")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await expect(page.getByRole("heading", { name: "My profile" })).toHaveCount(0);
  await expect(page.getByText("YOUR BRIGHTWAY PROFILE")).toHaveCount(0);

  await expect(page.locator("#profile-panel-achievements")).toBeHidden();
  await expect(page.locator("#profile-panel-activity")).toBeHidden();
  await tabs.getByRole("tab", { name: "Activity" }).click();
  await expect(tabs.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  const activity = page.locator("#profile-activity");
  await expect(activity.getByRole("heading", { name: "Activities" })).toHaveCount(0);
  await expect(activity.getByText("All your published posts, with their details and engagement.")).toHaveCount(0);
  await expect(activity.getByText("Finished a community coding project.")).toBeVisible();
  await expect(activity.getByRole("heading", { name: "Community workshop", exact: true })).toBeVisible();
  const rail = activity.getByRole("region", { name: /Your posts/ });
  await expect(rail).toBeVisible();
  await expect(rail.locator(".bw-timeline-post")).toHaveCount(2);
  await expect(rail.getByRole("img", { name: "Verified identity" })).toHaveCount(2);
  await expect(rail.getByLabel("28 views")).toBeVisible();
  await expect(rail.getByLabel("2 comments")).toBeVisible();
  await expect(rail.getByText("6 people attending")).toBeVisible();
  await expect(activity.getByRole("link", { name: /View full post/ }).first())
    .toHaveAttribute("href", "/explore?source=member&post=11111111-1111-4111-8111-111111111111");
  const feedLayout = await rail.evaluate(element => {
    const cards = [...element.querySelectorAll(".bw-profile-activity-item")];
    const first = cards[0].getBoundingClientRect();
    const second = cards[1].getBoundingClientRect();
    return {
      display: getComputedStyle(element).display,
      firstX: first.x, secondX: second.x,
      firstBottom: first.bottom, secondTop: second.top,
      firstWidth: first.width, secondWidth: second.width,
      feedWidth: element.getBoundingClientRect().width,
    };
  });
  expect(feedLayout.display).toBe("grid");
  expect(feedLayout.secondTop).toBeGreaterThan(feedLayout.firstBottom);
  expect(Math.abs(feedLayout.firstX - feedLayout.secondX)).toBeLessThanOrEqual(2);
  expect(Math.abs(feedLayout.firstWidth - feedLayout.secondWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(feedLayout.firstWidth - feedLayout.feedWidth)).toBeLessThanOrEqual(2);
  await expect(activity.getByRole("button", { name: "Next posts" })).toHaveCount(0);
  await expect(activity.getByRole("button", { name: "Previous posts" })).toHaveCount(0);
  await activity.getByRole("button", { name: "Load older activity" }).click();
  await expect(activity.getByText("Finding a mentor")).toBeVisible();
  await expect(activity.locator(".bw-profile-activity-item")).toHaveCount(3);
  const chronological = await rail.locator(".bw-profile-activity-item").evaluateAll(cards =>
    cards.map(card => card.getBoundingClientRect().top));
  expect(chronological[0]).toBeLessThan(chronological[1]);
  expect(chronological[1]).toBeLessThan(chronological[2]);
  expect(api.activityReads()).toBe(2);
  await expect(page.locator("#profile-privacy")).toBeVisible();
  await expect(page.getByText("Public profile private")).toHaveCount(0);
   await expect(page.getByText("Identity not verified")).toHaveCount(0);
   await expect(page.locator(".bw-profile-hero").getByRole("button", { name: "Edit career direction" })).toHaveCount(0);
   await expect(page.locator(".bw-profile-hero").getByRole("link", { name: "See activity" })).toHaveCount(0);
   await expect(page.getByRole("checkbox", { name: /Publish my basic profile/ })).not.toBeChecked();
  await expect(page.getByRole("heading", { name: "Profile checklist" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Profile checklist progress" }))
    .toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByText("1 of 3 requirements met")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Profile tools" })
    .getByRole("link", { name: "Account security" })).toHaveAttribute("href", "/security");
  await page.getByRole("button", { name: "Edit introduction", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit introduction" })).toBeVisible();
  await page.getByRole("button", { name: "Close editor and keep edits" }).click();
  expect(api.privateReads()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});

test("own post cards expose a top-right three-dot menu for edit and confirmed deletion", async ({ page }) => {
  await fixture(page);
  const id = "11111111-1111-4111-8111-111111111111";
  const writes = [];
  await page.route("**/api/v1/posts/me/" + id, route => {
    const request = route.request();
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      writes.push({ method: "PATCH", body });
      return route.fulfill({ json: { success: true, data: { post: {
        id, type: "ACHIEVEMENT", body: body.body, tags: body.tags,
        createdAt: "2026-11-09T09:00:00Z",
        member: { name: "Synthetic Member", username: "synthetic", verified: true },
      } } } });
    }
    if (request.method() === "DELETE") {
      writes.push({ method: "DELETE" });
      return route.fulfill({ json: { success: true, data: { id } } });
    }
    return route.continue();
  });
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Activity" }).click();
  const first = page.locator("#profile-activity .bw-profile-activity-item").first();
  await expect(first).toBeVisible();
  const menuTrigger = first.getByRole("button", { name: "Post options" });
  await expect(menuTrigger).toBeVisible();
  const geometry = await first.evaluate(element => {
    const card = element.getBoundingClientRect();
    const menu = element.querySelector(".bw-post-options-trigger").getBoundingClientRect();
    return { cardRight: card.right, menuRight: menu.right, cardTop: card.top, menuTop: menu.top };
  });
  expect(geometry.cardRight - geometry.menuRight).toBeLessThan(22);
  expect(geometry.menuTop - geometry.cardTop).toBeLessThan(25);
  await menuTrigger.click();
  await expect(first.getByRole("menuitem", { name: "Edit post" })).toBeVisible();
  await expect(first.getByRole("menuitem", { name: "Delete post" })).toBeVisible();
  await first.getByRole("menuitem", { name: "Edit post" }).click();
  const editor = page.getByRole("dialog", { name: "Edit post" });
  await expect(editor).toBeVisible();
  await editor.getByRole("textbox", { name: "Post description" }).fill("A newly edited learning achievement");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toHaveCount(0);
  await expect(first.getByText("A newly edited learning achievement")).toBeVisible();
  expect(writes[0].method).toBe("PATCH");
  expect(writes[0].body.expectedBody).toBe("Finished a community coding project.");

  await menuTrigger.click();
  await first.getByRole("menuitem", { name: "Delete post" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete post" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  expect(writes).toHaveLength(1);
  await menuTrigger.click();
  await first.getByRole("menuitem", { name: "Delete post" }).click();
  await confirmation.getByRole("button", { name: "Delete post" }).click();
  await expect(page.locator("#post-member-11111111-1111-4111-8111-111111111111")).toHaveCount(0);
  expect(writes[1].method).toBe("DELETE");
  await expect(page.locator("#profile-activity .bw-profile-activity-item")).toHaveCount(1);
});

test("profile tabs support keyboard navigation and bookmarked section anchors", async ({ page }) => {
  await fixture(page);
  await page.goto("/profile");
  const tabs = page.getByRole("tablist", { name: "Profile sections" });
  const about = tabs.getByRole("tab", { name: "About Me" });
  const achievements = tabs.getByRole("tab", { name: "Achievements" });
  const activity = tabs.getByRole("tab", { name: "Activity" });
  await about.focus();
  await about.press("ArrowRight");
  await expect(achievements).toBeFocused();
  await expect(achievements).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-panel-about")).toBeHidden();
  await expect(page.locator("#profile-panel-achievements")).toBeVisible();
  await achievements.press("End");
  await expect(activity).toBeFocused();
  await expect(activity).toHaveAttribute("aria-selected", "true");
  await activity.press("Home");
  await expect(about).toBeFocused();
  await expect(page.locator("#profile-panel-about")).toBeVisible();

  await page.goto("/profile#profile-activity");
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-activity")).toBeVisible();

  await page.goto("/profile#profile-education");
  await expect(page.getByRole("tab", { name: "Achievements" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#profile-education")).toBeVisible();
});

test("profile Activities keeps commenter and answer photos at post-card avatar size", async ({ page }) => {
  await fixture(page, {}, {}, "Finished a community coding project.", {}, true);
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Activity" }).click();
  const activity = page.locator("#profile-activity");
  const firstPost = activity.locator(".bw-profile-activity-item").first();
  await expect(firstPost).toBeVisible();
  await firstPost.getByRole("button", { name: "Comments" }).click();
  const commentPhoto = firstPost.locator(".bw-discussion-avatar img");
  await expect(commentPhoto).toBeVisible();
  await expect(commentPhoto).toHaveJSProperty("naturalWidth", 1200);

  await activity.getByRole("button", { name: "Load older activity" }).click();
  const question = activity.locator('.bw-profile-activity-item[data-activity-type="QUESTION"]');
  await expect(question).toBeVisible();
  const previewPhoto = question.locator(".bw-question-answer-avatar img");
  await expect(previewPhoto).toBeVisible();
  await expect(previewPhoto).toHaveJSProperty("naturalWidth", 1200);
  await question.getByRole("button", { name: "Answer", exact: true }).click();
  const answerPhoto = question.locator(".bw-discussion-avatar img");
  await expect(answerPhoto).toBeVisible();
  await expect(answerPhoto).toHaveJSProperty("naturalWidth", 1200);

  const sizes = await activity.evaluate(element => {
    const measure = selector => {
      const image = element.querySelector(selector);
      const avatar = image.parentElement;
      const box = avatar.getBoundingClientRect();
      const photo = image.getBoundingClientRect();
      const css = getComputedStyle(avatar);
      return {
        width: box.width, height: box.height,
        photoWidth: photo.width, photoHeight: photo.height,
        radius: css.borderRadius,
      };
    };
    return {
      preview: measure('.bw-question-answer-avatar img'),
      comment: measure('.bw-profile-activity-item:first-child .bw-discussion-avatar img'),
      answer: measure('[data-activity-type="QUESTION"] .bw-discussion-avatar img'),
    };
  });
  for (const key of ["preview", "comment", "answer"]) {
    expect(sizes[key].width).toBeLessThanOrEqual(key === "preview" ? 31 : 37);
    expect(sizes[key].height).toBeLessThanOrEqual(key === "preview" ? 31 : 37);
    expect(sizes[key].photoWidth).toBeLessThanOrEqual(sizes[key].width);
    expect(sizes[key].photoHeight).toBeLessThanOrEqual(sizes[key].height);
    expect(sizes[key].radius).toBe("50%");
  }
});

test("post captions show exactly two visual lines with See more, then expand and collapse", async ({ page }) => {
  const ending = "This closing detail must remain readable after expansion.";
  const longCaption = "Built something meaningful through research, prototypes, testing and collaboration. "
    .repeat(8) + ending;
  await fixture(page, {}, {}, longCaption);
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Activity" }).click();
  const card = page.locator("#profile-activity .bw-timeline-post").first();
  await expect(card).toBeVisible();
  const caption = card.locator(".bw-post-text");
  await expect(caption).toHaveText(longCaption);
  const collapsed = await caption.evaluate(element => {
    const css = getComputedStyle(element);
    return { clamp: css.webkitLineClamp,
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(css.lineHeight),
      scrollHeight: element.scrollHeight };
  });
  expect(collapsed.clamp).toBe("2");
  expect(collapsed.height).toBeLessThanOrEqual(collapsed.lineHeight * 2 + 2);
  expect(collapsed.scrollHeight).toBeGreaterThan(collapsed.height + 2);
  const more = card.getByRole("button", { name: "See more" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(caption).toHaveText(longCaption);
  await expect(caption).not.toHaveClass(/bw-post-caption--collapsed/);
  await expect(card.getByRole("button", { name: "See less" })).toHaveAttribute("aria-expanded", "true");
  const expandedHeight = await caption.evaluate(element => element.getBoundingClientRect().height);
  expect(expandedHeight).toBeGreaterThan(collapsed.height);
  await card.getByRole("button", { name: "See less" }).click();
  await expect(caption).toHaveClass(/bw-post-caption--collapsed/);
  await expect(card.getByRole("button", { name: "See more" })).toBeVisible();
});

test("Activities keeps the regular post author layout with long verified names", async ({ page }) => {
  const longName = "Alexandria Catherine Montgomery-Williamson";
  const longUsername = "very-long-professional-username-from-liberia";
  await fixture(page, {}, {}, "A new achievement.", {
    name: longName, username: longUsername,
  });
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Activity" }).click();
  const rail = page.locator("#profile-activity .bw-profile-activity-list");
  await expect(rail.locator(".bw-timeline-post")).toHaveCount(2);
  const card = rail.locator(".bw-timeline-post").first();
  await expect(card.getByRole("link", { name: longName })).toBeVisible();
  await expect(card.getByRole("img", { name: "Verified identity" })).toBeVisible();
  await expect(card.getByText("@" + longUsername)).toBeVisible();
  const geometry = await card.evaluate(element => {
    const avatar = element.querySelector(".bw-timeline-avatar").getBoundingClientRect();
    const author = element.querySelector(".bw-timeline-byline").getBoundingClientRect();
    const cardRect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return {
      display: styles.display, columns: styles.gridTemplateColumns,
      avatarX: avatar.x, avatarY: avatar.y, avatarRight: avatar.right,
      authorX: author.x, authorY: author.y, authorRight: author.right,
      cardRight: cardRect.right,
    };
  });
  expect(geometry.display).toBe("grid");
  expect(geometry.authorX).toBeGreaterThan(geometry.avatarRight);
  expect(Math.abs(geometry.avatarY - geometry.authorY)).toBeLessThanOrEqual(4);
  expect(geometry.authorRight).toBeLessThanOrEqual(geometry.cardRight + 1);
  await expect(rail.getByRole("img", { name: "Verified identity" })).toHaveCount(2);
});

test("published profile shows only shared fields in a responsive modern layout", async ({ page }) => {
  const api = await fixture(page);
  await page.goto("/people/maya");
  await expect(page.getByRole("heading", { level: 1, name: "Maya Cole" })).toBeVisible();
  await expect(page.getByText("Published profile", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Profile avatar" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Published profile sections" })
    .getByRole("link", { name: "Career direction" })).toHaveAttribute("href", "#published-direction");
  await expect(page.getByText("Helping students create their first projects.")).toBeVisible();
  await expect(page.getByText("TypeScript", { exact: true })).toBeVisible();
  await expect(page.getByText("Make technology education accessible.")).toBeVisible();
  await expect(page.getByText("synthetic@example.org")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Contact" })).toHaveCount(0);
  expect(api.publicViews()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});

test("profile introduction uses saved affiliations without inventing credentials or exposing unpublished details", async ({ page }) => {
  await fixture(page, {
    experience: { mode: "RECORDS", records: [{
      id: "experience-1", role: "Software developer", organization: "Community Labs",
      current: true, status: "DRAFT", startMonth: "2025-01", endMonth: null,
    }] },
    education: { mode: "RECORDS", records: [{
      id: "education-1", institution: "Starz University", qualification: "Computer Science",
      current: true, status: "DRAFT", startMonth: "2024-01", endMonth: null,
    }] },
  });
  await page.goto("/profile");

  const affiliation = page.locator(".bw-profile-affiliations");
  await expect(affiliation.getByText("Community Labs")).toBeVisible();
  await expect(affiliation.getByText("Starz University")).toBeVisible();
  await expect(affiliation.getByText("Software developer")).toBeVisible();
  await expect(page.getByRole("link", { name: "View public profile" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Achievements" }).click();
  const order = await page.locator("#profile-panel-achievements > #profile-experience, #profile-panel-achievements > #profile-education")
    .evaluateAll(elements => elements.map(element => element.id));
  expect(order).toEqual(["profile-experience", "profile-education"]);
  await expect(page.locator("#profile-experience")).toBeVisible();
  await expect(page.locator("#profile-education")).toBeVisible();
  await expect(page.locator("#profile-certifications")).toBeVisible();

  await page.getByRole("tab", { name: "About Me" }).click();
  await page.getByRole("button", { name: "Edit my direction" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("published members keep consent settings without redundant hero buttons", async ({ page }) => {
  await fixture(page, { profilePublicEnabled: true });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Synthetic Member" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Publish my basic profile/ })).toBeChecked();
  await expect(page.locator(".bw-profile-hero").getByText("Public profile published")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View public profile" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See activity" })).toHaveCount(0);
  await expect(page.locator("#profile-activity")).toBeHidden();
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.locator("#profile-activity")).toBeVisible();
});

test("public professional proof separates verified records from self-reported certificates and links achievements", async ({ page }) => {
  const publicSections = {
    identityVerified: true,
    verifiedCredentials: [{
      id: "education-1", kind: "education", title: "BSc Computer Science",
      organization: "Starz University", startMonth: "2023-09",
      endMonth: null, current: true, verifiedBy: "Starz University",
    }],
    certifications: [{
      title: "Cloud Fundamentals", issuer: "Training Center",
      issuedMonth: "2026-02", expiresMonth: null, credentialUrl: "https://example.org/cert",
      verified: false,
    }],
    achievements: [{
      id: "11111111-1111-4111-8111-111111111111",
      body: "Completed a new education platform.", tags: ["Coding"],
      createdAt: "2026-11-08T09:00:00Z",
    }],
  };
  await fixture(page, {}, publicSections);
  await page.goto("/people/maya");
  const nav = page.getByRole("navigation", { name: "Published profile sections" });
  await expect(nav.getByRole("link", { name: "Verified credentials" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Certifications" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Achievements" })).toBeVisible();
  const review = page.locator("#published-credentials");
  await expect(review.getByText("BSc Computer Science")).toBeVisible();
  await expect(review.getByText(/Verified credential · Starz University/)).toBeVisible();
  await expect(review.getByRole("img", { name: "Verified identity" })).toHaveCount(0);
  const certificates = page.locator("#published-certifications");
  await expect(certificates.getByText("Cloud Fundamentals")).toBeVisible();
  await expect(certificates.getByText(/not independently verified/i)).toBeVisible();
  await expect(certificates.getByRole("link", { name: "View certificate" }))
    .toHaveAttribute("href", "https://example.org/cert");
  const achievements = page.locator("#published-achievements");
  await expect(achievements.getByText("Completed a new education platform.")).toBeVisible();
  await expect(achievements.getByRole("link", { name: "View achievement" }))
    .toHaveAttribute("href", "/explore?source=member&post=11111111-1111-4111-8111-111111111111");
  await expect(page.getByText("synthetic@example.org")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});
