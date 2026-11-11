import { expect, test } from "@playwright/test";
const cid = "33333333-3333-4333-8333-333333333333", mid = "44444444-4444-4444-8444-444444444444";
const account = { id: "11111111-1111-4111-8111-111111111111", username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } };
const c = { id: cid, kind: "DIRECT", counterpart: { fullName: "Alice Johnson", username: "alice" }, unread: 1, canSend: true, latest: { body: "Let us discuss our scholarship", createdAt: "2026-11-11T12:00:00Z" } };
const incoming = { sequence: "1", id: mid, own: false, sender: { fullName: "Alice Johnson" }, body: "Let us discuss our scholarship", state: "SENT", createdAt: "2026-11-11T12:00:00Z", attachments: [], share: null };
async function fixture(page) {
  const state = { failed: true, sends: [], messages: [incoming], errors: [] };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.addInitScript(() => { window.EventSource = class { addEventListener() {} close() {} }; });
  await page.route("**/api/v1/**", route => {
    const url = new URL(route.request().url()), body = route.request().postDataJSON();
    const reply = (data, status = 200) => route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, message: data } });
    if (url.pathname.endsWith("/auth/me")) return reply({ account });
    if (url.pathname.endsWith("/profile/me")) return reply({ profile: { version: 1, location: {}, photo: null, interests: [], skills: [] } });
    if (url.pathname.endsWith("/work/access")) return reply({ hasWork: false });
    if (url.pathname.endsWith("/preferences")) return reply({ showActive: false, showTyping: true });
    if (url.pathname.endsWith("/heartbeat") || url.pathname.endsWith("/receipts") || url.pathname.endsWith("/typing")) return reply({ saved: true });
    if (url.pathname.endsWith("/conversations")) return reply({ items: [c], nextCursor: null });
    if (url.pathname.endsWith("/messages")) { state.sends.push(body); if (state.failed) return reply("Connection interrupted", 503); state.messages.push({ ...incoming, id: "55555555-5555-4555-8555-555555555555", sequence: "2", body: body.body, own: true, sender: { fullName: "Synthetic Owner" }, state: "SENT" }); return reply(state.messages.at(-1)); }
    if (url.pathname.endsWith("/" + cid)) return reply({ conversation: c, items: state.messages, nextCursor: null, presence: { active: false, typing: true, lastActiveAt: null } });
    return reply({ items: [], nextCursor: null });
  });
  return state;
}
test("messaging keeps failed drafts, retries once and fits desktop and mobile", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto("/messages?conversation=" + cid);
  await expect(page.getByRole("heading", { name: "Alice Johnson", exact: true })).toBeVisible();
  await expect(page.getByText("Typing…", { exact: true })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Can we review the admission requirements together?"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted"); await expect(input).toHaveValue("Can we review the admission requirements together?");
  state.failed = false; await page.getByRole("button", { name: "Retry message" }).click();
  await expect(input).toHaveValue(""); await expect(page.getByText("✓ Sent", { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(2); expect(state.sends[0]).toEqual(state.sends[1]); expect(state.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`sprint8-${info.project.name}.png`), fullPage: true });
});
