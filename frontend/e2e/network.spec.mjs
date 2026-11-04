import { test, expect } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
async function fixture(page) {
  const state = { connection: "NONE", version: 0, writes: [], unexpected: [], errors: [], reads: 0, delay: 0, status: 200 };
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
    if (path === "/api/v1/network/people/grace/actions") {
      const body = request.postDataJSON(); state.writes.push(body); state.version++;
      state.connection = { REQUEST: "OUTGOING", CANCEL: "NONE", ACCEPT: "CONNECTED", REMOVE: "NONE", BLOCK: "BLOCKED", UNBLOCK: "NONE" }[body.action]; return reply({ saved: true, version: state.version });
    }
    if (path.startsWith("/api/v1/network")) {
      if (state.status !== 200) return reply("Synthetic network outage", state.status);
      const person = { username: "grace", fullName: "Grace Johnson" }, relationship = { state: state.connection, version: state.version };
      if (path.endsWith("/contact")) return reply(state.connection === "BLOCKED" ? {} : { phoneNumber: "+231770000000" });
      if (path === "/api/v1/network/people/grace") return reply({ person, relationship });
      if (path === "/api/v1/network") { state.reads++; if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); return reply({ view: url.searchParams.get("view"), items: state.connection === "NONE" ? [] : [{ person, relationship }], nextCursor: null }); }
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
