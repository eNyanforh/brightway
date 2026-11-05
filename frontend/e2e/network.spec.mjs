import { test, expect } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
async function fixture(page) {
  const state = { connection: "NONE", version: 0, following: false, followedBy: true, followVersion: 0, organizationFollowing: false, organizationVersion: 0, followWrites: [], writes: [], unexpected: [], errors: [], reads: 0, delay: 0, status: 200 };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== "http://127.0.0.1:4187") return route.abort();
    if (!path.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, message: data } });
    const account = { id, username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } };
    if (path === "/api/v1/auth/me") return reply({ account });
    if (path === "/api/v1/profile/me") return reply({ profile: { id: "profile", version: 1, photo: null, location: {}, interests: [], skills: [] } });
    if (path === "/api/v1/work/access") return reply({ hasWork: false });
    if (path.startsWith("/api/v1/network/follows/") && path.endsWith("/actions")) {
      const body = request.postDataJSON(), org = path.includes("/organizations/"); state.followWrites.push({ path, body });
      if (org) { state.organizationFollowing = body.action === "FOLLOW"; state.organizationVersion++; } else { state.following = body.action === "FOLLOW"; state.followVersion++; }
      return reply({ saved: true });
    }
    if (path === "/api/v1/network/people/grace/actions") {
      const body = request.postDataJSON(); state.writes.push(body); state.version++;
      if (body.action === "BLOCK") { state.followedBy = false; if (state.following) { state.following = false; state.followVersion++; } }
      state.connection = { REQUEST: "OUTGOING", CANCEL: "NONE", ACCEPT: "CONNECTED", REMOVE: "NONE", BLOCK: "BLOCKED", UNBLOCK: "NONE" }[body.action]; return reply({ saved: true, version: state.version });
    }
    if (path.startsWith("/api/v1/network")) {
      if (state.status !== 200) return reply("Synthetic network outage", state.status);
      const person = { username: "grace", fullName: "Grace Johnson" }, relationship = { state: state.connection, version: state.version };
      if (path.endsWith("/contact")) return reply(state.connection === "CONNECTED" ? { phoneNumber: "+231770000000" } : {});
      const follow = { active: state.following, version: state.followVersion, targetRef: "b".repeat(64) };
      if (["/api/v1/network/people/grace", "/api/v1/network/follows/people/grace"].includes(path)) return reply({ kind: "PERSON", person, relationship, available: true, follow });
      if (path === "/api/v1/network/follows/organizations/school") return reply({ kind: "ORGANIZATION", person: { username: "school", fullName: "Synthetic Learning Centre" }, relationship: { state: "NONE", version: 0 }, available: true, follow: { active: state.organizationFollowing, version: state.organizationVersion, targetRef: "c".repeat(64) }, publicUrl: "/organizations/22222222-2222-4222-8222-222222222222" });
      if (path === "/api/v1/network") { state.reads++; if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); const view = url.searchParams.get("view");
        let items = state.connection === "NONE" ? [] : [{ person, relationship }];
        if (view === "following") items = [...(state.following ? [{ kind: "PERSON", person, relationship: { state: "FOLLOWING", version: 0 } }] : []), ...(state.organizationFollowing ? [{ kind: "ORGANIZATION", person: { username: "school", fullName: "Synthetic Learning Centre" }, relationship: { state: "FOLLOWING", version: 0 } }] : [])];
        if (view === "followers") items = state.followedBy ? [{ kind: "PERSON", person, relationship: { state: "FOLLOWS_YOU", version: 0 } }] : [];
        return reply({ view, items, nextCursor: null }); }
    }
    state.unexpected.push(path); return reply("Unexpected synthetic request", 500);
  }); return state;
}
async function layout(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await expect(page.locator("main h1")).toHaveCount(1); }
test("personal network requests and confirmed blocking preserve consent on desktop/mobile", async ({ page }, info) => {
  const state = await fixture(page); await page.goto("/network");
  await expect(page.getByRole("heading", { name: "Network", exact: true })).toBeVisible();
  await page.getByLabel("Connect by BrightWay username").fill("grace"); await page.getByRole("button", { name: "Find person", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click(); await expect(page.getByRole("button", { name: "Cancel request", exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ action: "REQUEST", expectedVersion: 0 });
  await page.getByRole("button", { name: "Cancel request", exact: true }).click(); await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  state.connection = "CONNECTED"; state.version++;
  await page.getByRole("button", { name: "Refresh", exact: true }).click(); await expect(page.getByRole("button", { name: "Remove connection", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View shared contact", exact: true }).click(); await expect(page.getByText("+231770000000", { exact: true })).toBeVisible();
  await layout(page); await info.attach(`network-${info.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await page.getByRole("button", { name: "Block person", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes.map(x => x.action)).toEqual(["REQUEST", "CANCEL"]);
  await page.getByRole("button", { name: "Block person", exact: true }).click(); await page.getByRole("button", { name: "Confirm block", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unblock person", exact: true })).toBeVisible(); await expect(page.getByText("+231770000000", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Unblock person", exact: true }).click(); await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  await layout(page); expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]);
});
test("network focus refresh shares reads, retains safe content and clears contacts on outage/denial", async ({ page }) => {
  const state = await fixture(page); state.connection = "CONNECTED"; state.version = 2; await page.goto("/network");
  await page.getByRole("button", { name: /Grace Johnson/ }).click(); await expect(page.getByRole("heading", { name: "Grace Johnson", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View shared contact", exact: true }).click(); await expect(page.getByText("+231770000000", { exact: true })).toBeVisible();
  const before = state.reads; state.delay = 600; await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
  await expect(page.getByText("Refreshing your network…", { exact: true })).toBeVisible(); await expect(page.getByRole("heading", { name: "Grace Johnson", exact: true })).toBeVisible(); await expect(page.getByText("+231770000000", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled(); expect(state.reads).toBe(before + 1);
  state.status = 503; await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByRole("alert")).toContainText("Synthetic network outage"); await expect(page.getByRole("heading", { name: "Grace Johnson", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Remove connection", exact: true })).toBeDisabled();
  state.status = 401; await page.getByRole("button", { name: "Reload saved state", exact: true }).click(); await expect(page.getByRole("heading", { name: "Grace Johnson", exact: true })).toHaveCount(0);
  await layout(page); expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]);
});

test("people and organization following stay separate from connections and private contacts", async ({ page }, info) => {
  const state = await fixture(page); await page.goto("/network");
  await page.getByLabel("Connect by BrightWay username").fill("grace"); await page.getByRole("button", { name: "Find person", exact: true }).click();
  await page.getByRole("button", { name: "Follow", exact: true }).click(); await expect(page.getByRole("button", { name: "Unfollow", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible(); await page.getByRole("button", { name: "View shared contact", exact: true }).click(); await expect(page.getByText("No contact details are shared with you.", { exact: true })).toBeVisible();
  expect(state.followWrites[0]).toMatchObject({ path: "/api/v1/network/follows/people/grace/actions", body: { action: "FOLLOW", expectedVersion: 0, targetRef: "b".repeat(64) } });
  await page.getByLabel("Look for").selectOption("ORGANIZATION"); await page.getByLabel("Organization username").fill("school"); await page.getByRole("button", { name: "Find organization", exact: true }).click(); await expect(page.getByRole("heading", { name: "Synthetic Learning Centre", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "View shared contact", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Follow", exact: true }).click(); await expect(page.getByRole("button", { name: "Unfollow", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Following", exact: true }).click(); await expect(page.getByRole("button", { name: /Synthetic Learning Centre/ })).toBeVisible(); await expect(page.getByRole("button", { name: /Grace Johnson/ })).toBeVisible();
  await page.getByRole("button", { name: /Synthetic Learning Centre/ }).click(); await expect(page.getByRole("link", { name: /View organization profile/ })).toHaveAttribute("target", "_blank");
  await layout(page); await page.evaluate(() => window.scrollTo(0, 0)); await info.attach(`following-${info.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await page.getByRole("button", { name: "Unfollow", exact: true }).click(); await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
  expect(state.organizationFollowing).toBe(false); expect(state.following).toBe(true); expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]);
});
test("blocking clears follows and unblocking never restores them; Followers is a separate view", async ({ page }) => {
  const state = await fixture(page); state.following = true; state.followVersion = 1; await page.goto("/network");
  await page.getByLabel("Connect by BrightWay username").fill("grace"); await page.getByRole("button", { name: "Find person", exact: true }).click(); await expect(page.getByRole("button", { name: "Unfollow", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Block person", exact: true }).click(); await page.getByRole("button", { name: "Confirm block", exact: true }).click(); await expect(page.getByRole("button", { name: "Unblock person", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Follow", exact: true })).toHaveCount(0); expect(state.following).toBe(false);
  await page.getByRole("button", { name: "Unblock person", exact: true }).click(); await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Followers", exact: true }).click(); await expect(page.getByText("Nothing here yet", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: /Grace Johnson/ })).toHaveCount(0);
  expect(state.followWrites).toHaveLength(0); await layout(page); expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]);
});
