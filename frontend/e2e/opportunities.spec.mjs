import { backgroundMessaging } from "./support/background-messaging.mjs";
import { expect, test } from "@playwright/test";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";
const origin = "http://127.0.0.1:4187";
const oid = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333", aid = "55555555-5555-4555-8555-555555555555", qid = "44444444-4444-4444-8444-444444444444";
const organization = { id: oid, name: "Synthetic Research Institute", type: "COMPANY", offersTraining: false };
const collaborator = { id: "99999999-9999-4999-8999-999999999999", name: "Collaborating Academy",
  username: "collaborating_academy", profilePhotoId: "photo-partner", verifiedAt: "2026-11-01T12:00:00Z" };
const permissions = ["organization.opportunities.manage", "organization.applications.review"];
const base = "/organization-workspace/" + oid;
const initialOpportunity = { id, organization, organizationId: oid, type: "JOB", title: "Community research assistant", description: "Join a research team and help improve education outcomes across communities.", location: "Monrovia, Liberia", workMode: "IN_PERSON", deadline: "2099-12-01T12:00:00Z", status: "PUBLISHED", publishedAt: "2026-11-11T12:00:00Z", version: 2, questions: [{ id: qid, type: "YES_NO", label: "Can you join our team?", required: true, options: [] }], createdAt: "2026-11-11T12:00:00Z" };
async function fixture(page) {
  const state = { opportunity: structuredClone(initialOpportunity), application: null, drafts: [], assets: [], errors: [], calls: [] };
  page.on("pageerror", e => state.errors.push(e.message));
  await page.route("**/*", async route => {
    // Background channels are independent of this journey; SSE behavior has its own HTTP test.
    const background = backgroundMessaging(route); if (background) return background;
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== origin) return route.abort();
    if (!path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, message: data } });
    state.calls.push(path);
    if (path === "/api/v1/auth/me") return reply({ account: { id: "11111111-1111-4111-8111-111111111111", username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } } });
    if (path === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: true });
    if (path === "/api/v1" + base) return reply({ accountId: "11111111-1111-4111-8111-111111111111", organization, permissions, membership: { role: "PRIMARY_ADMIN" }, staffVersion: 1, permissionCatalog: [], workspace: organizationWorkspace(organization, permissions, "PRIMARY_ADMIN"), setup: { organization, required: false, canEdit: true, version: 5 } });
    if (path === "/api/v1/opportunities") return reply({ items: [state.opportunity, ...["SCHOLARSHIP", "CHALLENGE", "EVENT"].map((type, i) => ({ ...state.opportunity, id: `${id.slice(0,-1)}${i}`, type, title: ["Student scholarship", "Community innovation challenge", "Research open day"][i] }))].filter(o => !url.searchParams.get("type") || o.type === url.searchParams.get("type")), nextCursor: null });
    if (path === "/api/v1/opportunities/" + id) return reply({ opportunity: state.opportunity, application: state.application && { id: aid } });
    if (path === "/api/v1/opportunities/" + id + "/application") {
      const body = request.postDataJSON();
      state.application = { id: aid, opportunity: state.opportunity, status: body.action === "SUBMIT" ? "SUBMITTED" : "DRAFT", publicParticipant: body.action === "SUBMIT" && body.publicParticipant === true, version: (state.application?.version || 0) + 1, answers: body.answers, files: [], events: [], createdAt: "2026-11-11T12:00:00Z", ...(body.action === "SUBMIT" ? { submittedAt: "2026-11-11T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", headline: "Data analyst", location: {}, skills: ["Data"], interests: ["Education"], credentials: [] }, opportunitySnapshot: { title: state.opportunity.title, organization: organization.name, questions: state.opportunity.questions }, events: [{ id: "submitted", toStatus: "SUBMITTED", createdAt: "2026-11-11T12:00:00Z" }] } : {}) };
      return reply(state.application);
    }
    if (path === "/api/v1/applications/me") return reply({ items: state.application ? [state.application] : [], nextCursor: null });
    if (path === "/api/v1/applications/me/" + aid) return reply(state.application);
    if (path === "/api/v1/applications/me/" + aid + "/withdraw") { state.application.status = "WITHDRAWN"; return reply(state.application); }
    if (path === "/api/v1" + base + "/challenge-assets") {
      const num = state.assets.length + 1;
      const asset = { id: `88888888-8888-4888-8888-${String(num).padStart(12,"0")}`,
        kind: url.searchParams.get("kind"), size: request.postDataBuffer()?.length || 1000 };
      state.assets.push(asset);
      return reply(asset, 201);
    }
    if (path.startsWith("/api/v1/opportunities/challenge-assets/")) {
      return route.fulfill({ status: 200, headers: { "Content-Type": "image/webp" },
        body: Buffer.from("UklGRj4AAABXRUJQVlA4IDIAAADQAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64") });
    }
    if (path === "/api/v1" + base + "/challenge-collaborator-search")
      return reply({ items: [collaborator] });
    if (path === "/api/v1" + base + "/challenge-collaborations")
      return reply({ items: [] });
    if (path === "/api/v1" + base + "/opportunities") {
      if (request.method() === "POST") { const body = request.postDataJSON(); const row = { ...body, id: "66666666-6666-4666-8666-666666666666", organization, version: 1, status: "DRAFT" }; state.drafts.push(row); return reply(row, 201); }
      return reply({ items: state.drafts, nextCursor: null });
    }
    if (path.endsWith("/status") && path.includes("/opportunities/")) { const row = state.drafts[0]; row.status = request.postDataJSON().status; row.version++; return reply(row); }
    if (path === "/api/v1" + base + "/applications") return reply({ items: state.application ? [state.application] : [], nextCursor: null });
    if (path === "/api/v1" + base + "/applications/" + aid) return reply({ ...state.application, canReview: true });
    if (path === "/api/v1" + base + "/applications/" + aid + "/status") { const body = request.postDataJSON(); state.application = { ...state.application, status: body.status, feedback: body.feedback, version: state.application.version + 1, canReview: true, events: [...state.application.events, { id: "decision", toStatus: body.status, feedback: body.feedback, createdAt: "2026-11-11T13:00:00Z" }] }; return reply(state.application); }
    if (path === "/api/v1/notifications") return reply({ items: state.application?.feedback ? [{ id: qid, kind: "APPLICATION_STATUS", createdAt: "2026-11-11T13:00:00Z", readAt: null, application: { id: aid, title: state.opportunity.title, status: state.application.status } }] : [], nextCursor: null });
    if (path === "/api/v1/search" || path === "/api/v1/search/content") return reply({ items: [], nextCursor: null });
    return reply("Unexpected synthetic request: " + path, 500);
  });
  return state;
}
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
test("Opportunities page intro is unboxed and aligned to the page edges", async ({ page }) => {
  await fixture(page);
  await page.goto("/opportunities");
  const header = page.locator(".bw-op-page > .bw-op-hero");
  const tabs = page.getByRole("navigation", { name: "Opportunity views" });
  await expect(header.getByRole("heading", { name: "Opportunities that move you forward." })).toBeVisible();
  await expect(header).toHaveCSS("border-top-width", "0px");
  await expect(header).toHaveCSS("padding-left", "0px");
  await expect(header).toHaveCSS("padding-right", "0px");
  await expect(header).toHaveCSS("background-image", "none");
  const [headerBounds, tabsBounds] = await Promise.all([header.boundingBox(), tabs.boundingBox()]);
  expect(headerBounds.x).toBeCloseTo(tabsBounds.x, 0);
  expect(headerBounds.x + headerBounds.width).toBeCloseTo(tabsBounds.x + tabsBounds.width, 0);
  const description = header.locator(".bw-op-intro");
  if (await description.isVisible()) {
    await expect(description).toHaveCSS("max-width", "none");
    const introBounds = await description.boundingBox();
    expect(introBounds.x).toBeCloseTo(tabsBounds.x, 0);
    expect(introBounds.x + introBounds.width).toBeCloseTo(tabsBounds.x + tabsBounds.width, 0);
  }
  await noOverflow(page);
});

test("members discover four opportunity types, save and submit an application, and withdraw", async ({ page }, testInfo) => {
  const state = await fixture(page);
  await page.goto("/opportunities");
  await expect(page.getByRole("link", { name: initialOpportunity.title, exact: true })).toBeVisible();
  await expect(page.locator(".bw-op-grid > article")).toHaveCount(4);
  await expect(page.locator(".bw-op-card")).toHaveCount(3);
  await expect(page.locator(".bw-rail-challenge-card")).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({ path: `/tmp/brightway-opportunities-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("link", { name: initialOpportunity.title, exact: true }).click();
  await page.getByLabel("Can you join our team?").selectOption("false");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application timeline" })).toBeVisible();
  expect(state.application.answers[qid]).toBe(false);
  await page.getByRole("button", { name: "Withdraw application", exact: true }).click(); await page.getByRole("button", { name: "Confirm withdrawal" }).click();
  await expect(page.locator(".bw-op-section-title")).toContainText("Withdrawn"); await noOverflow(page); expect(state.errors).toEqual([]);
});
test("Challenges in Opportunities reuse the Explore sidebar cover, identity and participation card", async ({ page }) => {
  const state = await fixture(page);
  await page.route("**/api/v1/explore/members/student_a/photo/photo-a", route => route.fulfill({
    status: 200, contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#5599cc"/></svg>',
  }));
  state.opportunity = {
    ...state.opportunity, type: "CHALLENGE", title: "Student innovation challenge",
    description: "Build a learning tool for students.", coverImage: "SCHOOLS",
    prize: "US$1,000",
    organization: { ...organization, verifiedAt: "2026-11-01T12:00:00Z" },
    collaborators: [{ organizationId: collaborator.id, organization: collaborator, state: "ACCEPTED" }],
    participantSummary: { count: 2, members: [
      { username: "student_a", name: "Student One", verified: true, photoId: "photo-a" },
      { username: "student_b", name: "Student Two", verified: true, photoId: null },
    ] },
  };
  await page.goto("/opportunities?type=CHALLENGE");
  const card = page.getByRole("article", { name: "Challenge: Student innovation challenge" });
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("background-image", /linear-gradient/);
  await expect(card.getByRole("heading", { name: "Student innovation challenge" })).toBeVisible();
  await expect(card.getByText("Build a learning tool for students.")).toBeVisible();
  const cover = card.getByRole("link", { name: "View challenge: Student innovation challenge" });
  await expect(cover).toHaveAttribute("href", "/opportunities/" + id);
  await expect(cover.locator("img")).toHaveAttribute("src", "/images/hero/schools-720.webp");
  await expect(cover.locator("img")).toHaveCSS("object-fit", "cover");
  const bounds = await cover.boundingBox();
  expect(bounds.width / bounds.height).toBeGreaterThan(1.58);
  expect(bounds.width / bounds.height).toBeLessThan(1.62);
  await expect(card.getByRole("link", { name: "View Synthetic Research Institute organization profile" }))
    .toHaveAttribute("href", "/organizations/" + oid);
  await expect(card.locator(".bw-rail-challenge-sponsor-name").getByRole("img", { name: "Verified organization" })).toBeVisible();
  await expect(card.getByRole("link", { name: "View co-host Collaborating Academy" })).toBeVisible();
  await expect(card.getByLabel("Challenge prize")).toContainText("US$1,000");
  await expect(card.locator("time")).toContainText(/Closes in/);
  await expect(card.getByLabel("Public Challenge participants")).toContainText("2 participants");
  const participantAvatars = card.locator(".bw-challenge-participant-facepile .bw-challenge-participant-avatar");
  await expect(participantAvatars).toHaveCount(2);
  const avatarBoxes = await Promise.all([participantAvatars.nth(0).boundingBox(), participantAvatars.nth(1).boundingBox()]);
  for (const box of avatarBoxes) {
    expect(box.width).toBeCloseTo(27, 0);
    expect(box.height).toBeCloseTo(27, 0);
  }
  expect(avatarBoxes[1].x).toBeLessThan(avatarBoxes[0].x + avatarBoxes[0].width);
  await expect(participantAvatars.first()).toHaveCSS("border-radius", "50%");
  const participantPhoto = participantAvatars.first().locator("img");
  await expect(participantPhoto).toBeVisible();
  await expect(participantPhoto).toHaveCSS("object-fit", "cover");
  await expect.poll(() => participantPhoto.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(card.getByRole("link", { name: "Partake" })).toHaveAttribute("href", "/opportunities/" + id);
  await expect(card.getByRole("link", { name: "Partake" })).toHaveCSS("min-height", "44px");
  await expect(card.locator(".bw-op-card-cover")).toHaveCount(0);
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});

test("challenge participant facepile requires separate optional public consent", async ({ page }) => {
  const state = await fixture(page);
  state.opportunity = { ...state.opportunity, type: "CHALLENGE", title: "Student innovation challenge", prize: "US$1,000" };
  await page.goto("/opportunities/" + id);
  await page.getByLabel("Can you join our team?").selectOption("false");
  const publicConsent = page.getByRole("checkbox", { name: /Show my public name and profile photo/ });
  await expect(publicConsent).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Share my answers, attachments/ }).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application timeline" })).toBeVisible();
  expect(state.application.publicParticipant).toBe(false);

  // A separate member may choose public identity, but this must never be
  // inferred merely from submitting or sharing with organization staff.
  state.application = null;
  await page.reload();
  await page.getByLabel("Can you join our team?").selectOption("false");
  await page.getByRole("checkbox", { name: /Share my answers, attachments/ }).check();
  await page.getByRole("checkbox", { name: /Show my public name and profile photo/ }).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application timeline" })).toBeVisible();
  expect(state.application.publicParticipant).toBe(true);
});

test("organization publishing workspace filters and displays listings without mobile overflow", async ({ page, isMobile }) => {
  const state = await fixture(page);
  const draft = { ...initialOpportunity, id: "66666666-6666-4666-8666-666666666667",
    title: "Community learning challenge", type: "CHALLENGE", workMode: "REMOTE",
    status: "DRAFT", version: 1, publishedAt: null, createdAt: "2026-11-14T12:00:00Z" };
  const published = { ...initialOpportunity, id: "66666666-6666-4666-8666-666666666668",
    title: "Research assistant position", status: "PUBLISHED", createdAt: "2026-11-13T12:00:00Z" };
  state.drafts.push(draft, published);
  await page.goto(base + "/opportunities");

  const workspace = page.locator(".bw-op-dashboard");
  await expect(workspace.getByRole("heading", { name: "Opportunities" })).toBeVisible();
  const metrics = workspace.getByLabel("Loaded opportunity summary");
  await expect(metrics).toContainText("Listings loaded");
  await expect(metrics).toContainText("Published");
  await expect(workspace.getByRole("article")).toHaveCount(2);
  const challenge = workspace.getByRole("article", { name: draft.title });
  await expect(challenge.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(challenge.getByRole("button", { name: "Publish" })).toBeVisible();
  await expect(challenge.getByRole("link", { name: "View listing" })).toHaveCount(0);
  const live = workspace.getByRole("article", { name: published.title });
  await expect(live.getByRole("link", { name: "View listing" }))
    .toHaveAttribute("href", "/opportunities/" + published.id);
  await expect(live.getByRole("button", { name: "Pause" })).toBeVisible();

  await workspace.getByRole("button", { name: /Drafts/ }).click();
  await expect(workspace.getByRole("article")).toHaveCount(1);
  await workspace.getByRole("button", { name: /^All/ }).click();
  await workspace.getByRole("combobox", { name: "Filter opportunity type" }).selectOption("CHALLENGE");
  await expect(workspace.getByRole("article")).toHaveCount(1);
  await workspace.getByRole("combobox", { name: "Filter opportunity type" }).selectOption("ALL");
  await workspace.getByRole("searchbox", { name: "Search opportunities" }).fill("assistant");
  await expect(workspace.getByRole("article")).toHaveCount(1);
  await workspace.getByRole("searchbox", { name: "Search opportunities" }).fill("");
  await expect(workspace.getByRole("article")).toHaveCount(2);

  const create = workspace.getByRole("button", { name: "+ Create opportunity" });
  const bounds = await create.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  if (isMobile) await expect(create).toBeVisible();
  await noOverflow(page);
  expect(state.errors).toEqual([]);
});

test("organization Challenge composer uses cover-left layout and preserves native fields", async ({ page, isMobile }) => {
  const state = await fixture(page);
  await page.goto(base + "/opportunities");
  await page.locator(".bw-op-dashboard-header").getByRole("button", { name: "+ Create opportunity" }).click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("heading", { name: "What opportunity do you want to offer?" })).toBeVisible();
  await editor.getByRole("radio", { name: /Challenge/ }).click();
  await editor.getByRole("button", { name: "Continue" }).click();
  await expect(editor).toHaveAttribute("aria-modal", "true");
  await expect(editor.getByRole("heading", { name: "Create your Challenge" })).toBeVisible();
  await expect(editor.getByText("BRIGHTWAY CHALLENGE", { exact: true })).toHaveCount(0);
  await expect(editor.getByText("Public on BrightWay", { exact: true })).toHaveCount(0);
  await expect(editor.locator(".bw-op-challenge-topic svg")).toHaveCount(12);
  await expect(editor.locator(".bw-op-description-field")).toBeVisible();
  await editor.getByRole("button", { name: "Open deadline calendar" }).click();
  await expect(editor.getByRole("group", { name: "Select deadline date and time" })).toBeVisible();
  await editor.getByRole("button", { name: "Open deadline calendar" }).click();
  await expect(editor.getByRole("heading", { name: "Post types" })).toBeVisible();
  const coverStage = editor.locator(".bw-op-challenge-cover-stage");
  const titleField = editor.getByLabel("Challenge Title");
  const composer = editor.locator(".bw-op-challenge-composer");
  await expect(composer).toBeVisible();
  const [coverBox, formBox] = await Promise.all([
    coverStage.boundingBox(), editor.locator(".bw-op-challenge-main").boundingBox(),
  ]);
  if (isMobile) {
    expect(formBox.y).toBeGreaterThanOrEqual(coverBox.y + coverBox.height - 1);
  } else {
    expect(formBox.x).toBeGreaterThanOrEqual(coverBox.x + coverBox.width - 1);
    expect(coverBox.width).toBeGreaterThan(240);
  }
  await expect(editor.getByRole("navigation", { name: "Creation progress" })).toHaveCount(0);
  await titleField.fill("Innovation on BrightWay");
  await editor.getByLabel("Description").fill("Create a learning tool, upload your work on BrightWay, and win awards.");
  await editor.getByRole("checkbox", { name: "Technology" }).check();
  await expect(editor.getByLabel("Format")).toHaveCount(0);

  await editor.getByRole("button", { name: "+ Add Prize" }).click();
  await editor.getByLabel("Prize 1 amount").fill("1000");
  await editor.getByLabel("Prize 1 currency").selectOption("USD");
  await editor.getByRole("button", { name: "+ Add another prize" }).click();
  await editor.getByLabel("Prize 2 type").selectOption("CERTIFICATE");
  await editor.getByLabel("Certificate Title").fill("Completion certificate");
  await editor.getByLabel("Issued By (optional)").fill("Research Institute");
  await editor.getByLabel("Search organization collaborators").fill("Collaborating");
  const match = editor.getByRole("button", { name: "Invite Collaborating Academy" });
  await expect(match).toBeVisible();
  await expect(match.getByRole("img", { name: "Verified organization" })).toBeVisible();
  await expect(match).toContainText("@collaborating_academy");
  await match.click();
  await expect(editor.getByText("Invite on save")).toBeVisible();

  await expect(editor.getByLabel("Challenge Title Image")).toHaveCount(0);
  await expect(editor.getByLabel("Background Image")).toHaveCount(0);
  await expect(editor.getByLabel("Default background photograph")).toHaveCount(0);
  const smallPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCXUAAAAASUVORK5CYII=", "base64");
  await editor.getByLabel("Challenge cover photo").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: smallPng });
  await expect.poll(() => state.assets.length).toBe(1);
  await expect(coverStage.locator("img")).toHaveAttribute("src", /challenge-assets/);
  await expect(coverStage.locator("img")).toHaveCSS("object-fit", "cover");

  await expect(editor.getByRole("heading", { name: "Post types" })).toBeVisible();
  await editor.getByRole("button", { name: "+ Add post type" }).click();
  await editor.getByRole("combobox", { name: "Post type 1" }).selectOption("VIDEO_POST");
  await editor.getByRole("spinbutton", { name: "Post type 1 Maximum duration" }).fill("60");
  await editor.getByRole("button", { name: "+ Add post type" }).click();
  await editor.getByRole("combobox", { name: "Post type 2" }).selectOption("CAPTION");
  await editor.getByRole("spinbutton", { name: "Post type 2 Maximum words" }).fill("100");

  await expect(editor.getByLabel("Number of Applicants (maximum)")).toHaveCount(0);
  await editor.getByLabel("Deadline (your local time)").fill("2099-12-01T12:00");

  await expect(editor.getByText("On BrightWay only")).toHaveCount(0);
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(editor).toHaveCount(0);
  expect(state.drafts).toHaveLength(1);
  const challenge = state.drafts[0];
  expect(challenge.type).toBe("CHALLENGE");
  expect(challenge.location).toBe("BrightWay");
  expect(challenge.workMode).toBe("REMOTE");
  expect(challenge.prizes).toEqual([
    { type: "CASH", amount: 1000, currency: "USD" },
    { type: "CERTIFICATE", title: "Completion certificate", issuer: "Research Institute" },
  ]);
  expect(challenge.collaboratorIds).toEqual([collaborator.id]);
  expect(challenge.coverAssetId).toBe(state.assets[0].id);
  expect(challenge.sponsorLogoIds).toEqual([]);
  expect(challenge.backgroundAssetId).toBeNull();
  expect(challenge.titleAssetId).toBeNull();
  expect(challenge).not.toHaveProperty("maxApplicants");
  expect(challenge.postRequirements.map(row => row.type)).toEqual(["VIDEO_POST", "CAPTION"]);
  expect(challenge.postRequirements[0].maxDurationSeconds).toBe(60);
  expect(challenge.postRequirements[1].maxWords).toBe(100);
  expect(challenge).not.toHaveProperty("applicationUrl");
  await noOverflow(page);
  expect(state.errors).toEqual([]);
  if (isMobile) await expect(page.locator(".bw-op-dashboard")).toBeVisible();
});

for (const [type, label] of [["EVENT", "Event"]]) {
  test(label + " uses the same responsive composer, uploads a cover, and saves type-specific fields", async ({ page, isMobile }) => {
    const state = await fixture(page);
    await page.goto(base + "/opportunities");
    await page.getByRole("button", { name: "+ Create opportunity" }).click();
    const editor = page.getByRole("dialog");
    await editor.getByRole("radio", { name: new RegExp(label) }).click();
    await editor.getByRole("button", { name: "Continue" }).click();
    await expect(editor.getByRole("heading", { name: "Create your " + label })).toBeVisible();
    await expect(editor.getByRole("navigation", { name: "Creation progress" })).toHaveCount(0);
    const coverStage = editor.locator(".bw-op-standard-preview-stage");
    const [coverBox, formBox] = await Promise.all([
      coverStage.boundingBox(), editor.locator(".bw-op-standard-main").boundingBox(),
    ]);
    if (isMobile) expect(formBox.y).toBeGreaterThanOrEqual(coverBox.y + coverBox.height - 1);
    else expect(formBox.x).toBeGreaterThanOrEqual(coverBox.x + coverBox.width - 1);
    await editor.getByLabel("Title", { exact: true }).fill(label + " for young researchers");
    await expect(editor.locator(".bw-op-standard-poster strong"))
      .toHaveText(label + " for young researchers");
    await editor.getByLabel("Description", { exact: true })
      .fill("Support young researchers with development, learning, and meaningful career opportunities.");
    await editor.getByLabel("Format").selectOption("HYBRID");
    await editor.getByLabel("Location").fill("Monrovia, Liberia");
    await editor.getByLabel("Deadline (your local time)").fill("2099-12-01T12:00");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCXUAAAAASUVORK5CYII=", "base64");
    await editor.getByLabel("Opportunity cover photo").setInputFiles({
      name: "cover.png", mimeType: "image/png", buffer: png,
    });
    await expect.poll(() => state.assets.length).toBe(1);
    await expect(coverStage.locator("img")).toHaveAttribute("src", /challenge-assets/);
    await expect(coverStage.locator("img")).toHaveCSS("object-fit", "cover");
    await editor.getByRole("button", { name: "Save draft" }).click();
    await expect(editor).toHaveCount(0);
    expect(state.drafts).toHaveLength(1);
    const saved = state.drafts[0];
    expect(saved.type).toBe(type);
    expect(saved.workMode).toBe("HYBRID");
    expect(saved.location).toBe("Monrovia, Liberia");
    expect(saved.coverAssetId).toBe(state.assets[0].id);
    expect(saved.postRequirements).toEqual([]);
    expect(saved.collaboratorIds).toEqual([]);
    await noOverflow(page);
    expect(state.errors).toEqual([]);
  });
}

test("Scholarship publishing uses six structured steps and a native application form", async ({ page, isMobile }) => {
  const state = await fixture(page);
  await page.goto(base + "/opportunities");
  await page.getByRole("button", { name: "+ Create opportunity" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("radio", { name: /Scholarship/ }).click();
  await editor.getByRole("button", { name: "Continue" }).click();
  await expect(editor.getByRole("navigation", { name: "Creation progress" })).toBeVisible();
  await editor.getByLabel("Scholarship title").fill("Scholarship for young researchers");
  await editor.getByLabel("Description", { exact: true }).fill("Support young researchers with development, learning, and meaningful career opportunities.");
  await editor.getByLabel("Scholarship category").selectOption("RESEARCH");
  await editor.getByLabel("Masters").check();
  const cover = editor.locator(".bw-op-standard-preview-stage");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCXUAAAAASUVORK5CYII=", "base64");
  await editor.getByLabel("Opportunity cover photo").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  await expect.poll(() => state.assets.length).toBe(1);
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Funding type").selectOption("FULLY_FUNDED");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Study mode").selectOption("HYBRID");
  await editor.getByLabel("Study destination").fill("Monrovia, Liberia");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Eligible countries").fill("Liberia");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Selection criteria").fill("Academic merit");
  await editor.getByLabel("Deadline (your local time)").fill("2099-12-01T12:00");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(editor).toHaveCount(0);
  const saved = state.drafts[0];
  expect(saved.type).toBe("SCHOLARSHIP");
  expect(saved.details.fundingType).toBe("FULLY_FUNDED");
  expect(saved.details.eligibleCountries).toEqual(["Liberia"]);
  expect(saved.questions.map(q => q.label)).toContain("Required document: Academic transcript");
  expect(saved.coverAssetId).toBe(state.assets[0].id);
  await noOverflow(page); expect(state.errors).toEqual([]);
});

test("organization publishers create and publish a form, and reviewers send an applicant decision", async ({ page, isMobile }, testInfo) => {
  const state = await fixture(page);
  state.application = { id: aid, opportunity: state.opportunity, status: "SUBMITTED", version: 1, answers: { [qid]: false }, files: [], events: [], submittedAt: "2026-11-11T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", headline: "Data analyst", location: {}, skills: ["Data"], interests: ["Education"], credentials: [] }, opportunitySnapshot: { title: state.opportunity.title, organization: organization.name, questions: state.opportunity.questions } };
  await page.goto(base + "/opportunities");
  await page.getByRole("button", { name: "+ Create opportunity" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("radio", { name: /Job/ }).click();
  await editor.getByRole("button", { name: "Continue" }).click();
  await expect(editor.getByRole("heading", { name: "Job information", exact: true })).toBeVisible();
  await expect(editor.getByRole("navigation", { name: "Creation progress" })).toBeVisible();
  const [coverBox, formBox] = await Promise.all([
    editor.locator(".bw-op-standard-preview-stage").boundingBox(),
    editor.locator(".bw-op-standard-main").boundingBox(),
  ]);
  if (isMobile) expect(formBox.y).toBeGreaterThanOrEqual(coverBox.y + coverBox.height - 1);
  else expect(formBox.x).toBeGreaterThanOrEqual(coverBox.x + coverBox.width - 1);
  await editor.getByLabel("Job title").fill("Data internship");
  await expect(editor.locator(".bw-op-standard-poster strong")).toHaveText("Data internship");
  await editor.getByLabel("Description", { exact: true }).fill("Build skills in field research, data quality, and community engagement.");
  await editor.getByLabel("Job category").selectOption("Research");
  await editor.getByLabel("Experience level").selectOption("ENTRY");
  await editor.getByLabel("Job type").selectOption("INTERNSHIP");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Work location").fill("Monrovia");
  await editor.getByLabel("Compensation").selectOption("PAID");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Job responsibilities").fill("Conduct research");
  await editor.getByLabel("Required qualifications").fill("High school");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByLabel("Deadline (your local time)").fill("2099-12-01T12:00");
  await editor.getByRole("button", { name: "+ Add question" }).click();
  await editor.getByLabel("Question 2 text").fill("Why would you like to join?");
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByRole("button", { name: "Continue" }).click();
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(editor).toHaveCount(0);
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Publish", exact: true }).click(); await expect(page.locator(".bw-op-managed-card")).toContainText("Published");
  await noOverflow(page); await page.goto(base + "/applications");
  await page.getByRole("button", { name: /Synthetic Applicant/ }).click();
  await page.getByRole("combobox", { name: "Decision", exact: true }).selectOption("SHORTLISTED"); await page.getByLabel("Message to applicant").fill("Please prepare for an interview.");
  await page.getByRole("button", { name: "Save decision" }).click(); await expect(page.getByRole("heading", { name: "Application timeline" })).toBeVisible();
  await page.screenshot({ path: `/tmp/brightway-applications-${testInfo.project.name}.png`, fullPage: true }); await noOverflow(page);
  await page.goto("/notifications"); await expect(page.getByRole("link", { name: initialOpportunity.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unread", exact: true }).click(); await expect(page.getByRole("link", { name: initialOpportunity.title, exact: true })).toBeVisible(); expect(state.errors).toEqual([]);
});
