import { backgroundMessaging } from "./support/background-messaging.mjs";
import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4187";
const account = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "synthetic_owner",
  person: { firstName: "Synthetic", lastName: "Owner" },
};
const visitor = { username: "synthetic_visitor", fullName: "Synthetic Visitor" };
const notice = {
  id: "22222222-2222-4222-8222-222222222222",
  viewer: visitor,
  createdAt: "2026-11-05T12:00:00.000Z",
  readAt: null,
};

async function fixture(page) {
  const state = { views: 0, inboxReads: 0, errors: [], unexpected: [] };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/*", async route => {
    // Background channels are independent of this journey; SSE behavior has its own HTTP test.
    const background = backgroundMessaging(route); if (background) return background;
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({
      status, json: status < 400 ? { success: true, data } : { success: false, message: data },
    });
    switch (url.pathname) {
      case "/api/v1/auth/me":
        return reply({ account });
      case "/api/v1/profile/me":
        return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
      case "/api/v1/work/access":
        if (state.waitForWork) await state.waitForWork;
        return reply({ hasWork: true });
      case "/api/v1/profiles/synthetic_visitor/view":
        expect(request.method()).toBe("POST");
        state.views++;
        return reply({ ...visitor, headline: "Published headline", location: {}, skills: [], interests: [] });
      case "/api/v1/notifications":
        state.inboxReads++;
        return reply({ items: [notice], nextCursor: null });
      case "/api/v1/notifications/" + notice.id + "/dismiss":
        await state.waitForDismiss;
        return reply("Your personal session changed. Sign in again.", 401);
      default:
        state.unexpected.push(url.pathname);
        return reply("Unexpected synthetic request", 500);
    }
  });
  return state;
}

test("opening a member profile leaves the account's workspace request intact", async ({ page }) => {
  const state = await fixture(page);
  const work = Promise.withResolvers();
  state.waitForWork = work.promise;
  try {
    await page.goto("/synthetic_visitor");
    await expect(page.getByRole("heading", { name: visitor.fullName })).toBeVisible();
    await expect(page.getByText("Published headline")).toBeVisible();
    expect(state.views).toBe(1);
  } finally {
    work.resolve();
  }
  await expect(page.locator(".bw-design-sidebar a[href='/work']")).toHaveCount(1);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test("the inbox defers focus reads while saving and clears private rows on denial", async ({ page }) => {
  const state = await fixture(page);
  const dismiss = Promise.withResolvers();
  state.waitForDismiss = dismiss.promise;
  await page.goto("/notifications");
  await expect(page.getByText(visitor.fullName, { exact: true })).toBeVisible();
  const before = state.inboxReads;
  try {
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(page.locator(".bw-notifications")).toHaveAttribute("aria-busy", "true");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(state.inboxReads).toBe(before);
  } finally {
    dismiss.resolve();
  }
  await expect(page.getByRole("alert")).toContainText("Your personal session changed");
  await expect(page.getByText(visitor.fullName, { exact: true })).toHaveCount(0);
  expect(state.inboxReads).toBe(before);
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});
