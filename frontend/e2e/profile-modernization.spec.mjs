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
  education: { mode: "RECORDS", records: [{
    id: "77777777-7777-4777-8777-777777777777", institution: "Example University",
    qualification: "Computer Science", startMonth: "2024-09", current: true,
    status: "SUBMITTED",
  }] },
  experience: { mode: "RECORDS", records: [{
    id: "88888888-8888-4888-8888-888888888888", organization: "Population Studies Institute",
    role: "IT Assistant", type: "EMPLOYMENT", startMonth: "2025-01", current: true,
    status: "VERIFIED",
  }] },
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

async function fixture(page) {
  let privateReads = 0;
  let publicViews = 0;
  let activityReads = 0;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = data => route.fulfill({ json: { success: true, data } });
    switch (url.pathname) {
      case "/api/v1/auth/me": return reply({ account });
      case "/api/v1/work/access": return reply({ hasWork: false });
      case "/api/v1/profile/me":
        privateReads++;
        return reply({ profile });
      case "/api/v1/posts/me":
        activityReads++;
        return reply(url.searchParams.has("cursor")
          ? { access: {}, items: [{
            id: "33333333-3333-4333-8333-333333333333", type: "QUESTION",
            body: "How do I find a mentor?", createdAt: "2026-11-07T09:00:00Z",
            questionDetails: { title: "Finding a mentor" }, tags: ["Learning"],
          }], nextCursor: null }
          : { access: {}, items: [
            { id: "11111111-1111-4111-8111-111111111111", type: "ACHIEVEMENT",
              body: "Finished a community coding project.", createdAt: "2026-11-09T09:00:00Z",
              tags: ["Coding"] },
            { id: "22222222-2222-4222-8222-222222222222", type: "EVENT",
              body: "Join our community workshop.", createdAt: "2026-11-08T09:00:00Z",
              eventDetails: { title: "Community workshop" }, tags: ["Career"] },
          ], nextCursor: "older" });
      case "/api/v1/manual-identity/status":
        return reply({ accountId: account.id, profileVersion: 1, status: "NOT_STARTED",
          identityVerified: false, canSubmit: false });
      case "/api/v1/profiles/maya/view":
        publicViews++;
        return reply(published);
      default: return reply({});
    }
  });
  return { privateReads: () => privateReads, publicViews: () => publicViews,
    activityReads: () => activityReads };
}

test("my profile organizes the saved identity, section navigation, completion and privacy on desktop and mobile", async ({ page }) => {
  const api = await fixture(page);
  await page.goto("/profile");
  const heading = page.getByRole("heading", { level: 1, name: "Synthetic Member" });
  await expect(heading).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Profile sections" });
  await expect(navigation.getByRole("link", { name: "About" })).toHaveAttribute("href", "#profile-about");
  await expect(navigation.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "#profile-privacy");
  await expect(page.locator("#profile-about")).toBeVisible();
  await expect(page.getByRole("heading", { name: "My profile" })).toHaveCount(0);
  await expect(page.getByText("YOUR BRIGHTWAY PROFILE")).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "#profile-activity");
  await expect(navigation.getByRole("link", { name: "Credentials" })).toHaveAttribute("href", "#profile-credentials");
  expect(await navigation.locator("a").allTextContents()).toEqual([
    "About", "Activity", "Experience", "Education", "Credentials", "Skills",
    "Career direction", "Interests", "Contact", "Privacy",
  ]);
  const highlights = page.locator(".bw-profile-highlights");
  await expect(highlights).toContainText("Population Studies Institute");
  await expect(highlights).toContainText("Example University");
  await expect(page.locator("#profile-credentials")).toContainText("IT Assistant");
  await expect(page.locator("#profile-credentials")).toContainText("1 record is awaiting a verification decision.");
  await expect(page.locator("#profile-credentials")).not.toContainText("Computer Science");
  await expect(page.locator("#profile-experience").getByText("Verified", { exact: true })).toBeVisible();
  await expect(page.locator("#profile-education").getByText("Submitted", { exact: true })).toBeVisible();
  const activity = page.locator("#profile-activity");
  await expect(activity.getByRole("heading", { name: "Activities" })).toBeVisible();
  await expect(activity.getByText("Finished a community coding project.")).toBeVisible();
  await expect(activity.getByRole("heading", { name: "Community workshop", exact: true })).toBeVisible();
  await expect(activity.getByRole("link", { name: "View post" }).first())
    .toHaveAttribute("href", "/explore?source=member&post=11111111-1111-4111-8111-111111111111");
  await activity.getByRole("button", { name: "Load older activity" }).click();
  await expect(activity.getByText("Finding a mentor")).toBeVisible();
  await expect(activity.locator(".bw-profile-activity-item")).toHaveCount(3);
  expect(api.activityReads()).toBe(2);
  await expect(page.locator("#profile-privacy")).toBeVisible();
  await expect(page.getByText("Public profile private")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Experience" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Education" })).toHaveCount(0);
  await expect(page.getByText("Population Studies Institute")).toHaveCount(0);
  expect(api.publicViews()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});
