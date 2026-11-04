import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import { setReadIdentity } from "../api/read-cache";
import NetworkPage from "../pages/NetworkPage";
const one = "11111111-1111-4111-8111-111111111111", two = "22222222-2222-4222-8222-222222222222";
const person = { username: "grace", fullName: "Grace Johnson" };
const reply = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } });
function mount({ state = "NONE", handler, strict = false } = {}) {
  const f = { state, version: 0, status: 200, writes: [], reads: 0, contact: { email: "shared@example.invalid" } };
  const fetch = vi.fn(async (url, options = {}) => {
    if (handler) { const custom = handler(url, options, f); if (custom !== undefined) return custom; }
    if (options.method === "POST") { const body = JSON.parse(options.body); f.writes.push(body); f.version++; f.state = { REQUEST: "OUTGOING", ACCEPT: "CONNECTED", DECLINE: "NONE", CANCEL: "NONE", REMOVE: "NONE", BLOCK: "BLOCKED", UNBLOCK: "NONE" }[body.action]; return reply({ saved: true, version: f.version, action: body.action }); }
    if (f.status >= 400) return reply("Network access unavailable", f.status);
    if (url.includes("/contact")) return reply(f.contact);
    if (url.includes("/people/")) return reply({ person, relationship: { state: f.state, version: f.version } });
    f.reads++; const view = new URL(url, "http://localhost").searchParams.get("view");
    return reply({ view, items: f.state === "NONE" ? [] : [{ person, relationship: { state: f.state, version: f.version } }], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetch); setReadIdentity("personal", one);
  const tree = id => <AuthContext.Provider value={{ account: { id, username: "owner" } }}><NetworkPage /></AuthContext.Provider>;
  const view = render(strict ? <StrictMode>{tree(one)}</StrictMode> : tree(one));
  return { ...f, data: f, fetch, user: userEvent.setup(), switchAccount(id) { setReadIdentity("personal", id); view.rerender(tree(id)); } };
}
async function find(f) { await screen.findByRole("button", { name: "Find person" }); await waitFor(() => expect(screen.getByRole("button", { name: "Find person" }).disabled).toBe(false)); await f.user.type(screen.getByLabelText("Connect by BrightWay username"), "grace"); await f.user.click(screen.getByRole("button", { name: "Find person" })); await screen.findByRole("heading", { name: "Grace Johnson" }); }
it("Strict Mode and overlapping focus events share initial reads and preserve existing content while refreshing", async () => {
  let release; const delayed = new Promise(resolve => { release = resolve; }); let calls = 0;
  const f = mount({ state: "CONNECTED", strict: true, handler(url) { if (!url.includes("/people/") && ++calls === 1) return delayed; } });
  await waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1)); act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); }); expect(f.fetch).toHaveBeenCalledTimes(1);
  await act(async () => release(reply({ view: "connections", items: [{ person, relationship: { state: "CONNECTED", version: 1 } }], nextCursor: null })));
  await screen.findByRole("button", { name: /Grace Johnson/ });
  act(() => window.dispatchEvent(new Event("focus"))); expect(screen.getByRole("button", { name: /Grace Johnson/ })).toBeTruthy(); await waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
});
it("looks up an exact username and submits one cookie-bound versioned request without ownership or trust flags", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = mount({ handler(url, options, state) { if (options.method === "POST") { state.writes.push(JSON.parse(options.body)); return pending; } } }); await find(f);
  const button = screen.getByRole("button", { name: "Connect", exact: true }); fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(f.data.writes).toHaveLength(1)); expect(f.data.writes[0]).toEqual({ action: "REQUEST", expectedVersion: 0, requestKey: expect.any(String) });
  const [, options] = f.fetch.mock.calls.find(([, o]) => o?.method === "POST"); expect(options.credentials).toBe("include"); expect(button.disabled).toBe(true);
  await act(async () => { f.data.state = "OUTGOING"; f.data.version = 1; release(reply({ saved: true })); }); await screen.findByRole("button", { name: "Cancel request" });
});
it("shows recipient acceptance controls and outgoing cancellation without inventing automatic consent", async () => {
  const f = mount({ state: "INCOMING" }); await find(f); expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
  await f.user.click(screen.getByRole("button", { name: "Accept request" })); await screen.findByRole("button", { name: "Remove connection" }); expect(f.data.writes[0].action).toBe("ACCEPT");
});
it("stale actions retain the selected person, disable writes and require an explicit reload", async () => {
  const f = mount({ handler(url, options) { if (options.method === "POST") return reply("This connection changed", 409); } }); await find(f);
  await f.user.click(screen.getByRole("button", { name: "Connect", exact: true })); await screen.findByRole("alert"); expect(screen.getByRole("heading", { name: "Grace Johnson" })).toBeTruthy(); expect(screen.getByRole("button", { name: "Connect", exact: true }).disabled).toBe(true);
  expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1); f.data.state = "CONNECTED"; f.data.version = 2;
  await f.user.click(screen.getByRole("button", { name: "Reload saved state" })); await screen.findByRole("button", { name: "Remove connection" }); expect(screen.queryByRole("alert")).toBeNull();
});
it("blocking requires confirmation, clears shared contacts and unblocking does not restore the connection", async () => {
  const f = mount({ state: "CONNECTED" }); await find(f); await f.user.click(screen.getByRole("button", { name: "View shared contact" })); await screen.findByText("shared@example.invalid");
  await f.user.click(screen.getByRole("button", { name: "Block person" })); const dialog = await screen.findByRole("dialog"); expect(f.data.writes).toHaveLength(0);
  await f.user.click(within(dialog).getByRole("button", { name: "Confirm block" })); await screen.findByRole("button", { name: "Unblock person" }); expect(screen.queryByText("shared@example.invalid")).toBeNull();
  await f.user.click(screen.getByRole("button", { name: "Unblock person" })); await screen.findByRole("button", { name: "Connect", exact: true }); expect(f.data.writes.map(x => x.action)).toEqual(["BLOCK", "UNBLOCK"]);
});
it("temporary revalidation failure keeps names visible but withdraws contact details and disables writes", async () => {
  const f = mount({ state: "CONNECTED" }); await find(f); await f.user.click(screen.getByRole("button", { name: "View shared contact" })); await screen.findByText("shared@example.invalid"); f.data.status = 503;
  act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert"); expect(screen.getByRole("heading", { name: "Grace Johnson" })).toBeTruthy(); expect(screen.queryByText("shared@example.invalid")).toBeNull(); expect(screen.getByRole("button", { name: "Remove connection" }).disabled).toBe(true);
  f.data.status = 401; act(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => expect(screen.queryByRole("heading", { name: "Grace Johnson" })).toBeNull()); expect(screen.queryByRole("button", { name: /Grace Johnson/ })).toBeNull();
});
it("switching accounts discards previous private state and ignores late responses", async () => {
  let release; const late = new Promise(resolve => { release = resolve; }); let first = true;
  const f = mount({ handler() { if (first) { first = false; return late; } return reply("Sign in again", 401); } });
  await waitFor(() => expect(f.fetch).toHaveBeenCalled()); f.switchAccount(two); await screen.findByRole("alert");
  await act(async () => release(reply({ items: [{ person, relationship: { state: "CONNECTED", version: 1 } }], nextCursor: null })));
  expect(screen.queryByText("Grace Johnson")).toBeNull(); expect(screen.queryByText("shared@example.invalid")).toBeNull();
});
it("newer lookups and refreshes cannot display a late contact response", async () => {
  let release; const late = new Promise(resolve => { release = resolve; });
  const f = mount({ state: "CONNECTED", handler(url) { if (url.endsWith("/contact")) return late; } }); await find(f); await f.user.click(screen.getByRole("button", { name: "View shared contact" }));
  act(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => expect(f.fetch.mock.calls.filter(([url]) => url.includes("/network?")).length).toBeGreaterThan(1));
  await act(async () => release(reply({ email: "late-private@example.invalid" }))); expect(screen.queryByText("late-private@example.invalid")).toBeNull();
});

it("a streaming authorization denial clears private data even when its parallel read aborts first", async () => {
  const f = mount({ state: "CONNECTED", handler(url, options, state) {
    if (!state.denialRace) return;
    if (url.includes("/network?")) return new Response(new ReadableStream({ start(controller) { setTimeout(() => { controller.enqueue(new TextEncoder().encode(JSON.stringify({ success:false,message:"Confirmed revoked session" }))); controller.close(); },30); } }), { status:401,headers:{"Content-Type":"application/json"} });
    if (url.includes("/people/")) return new Promise((resolve, reject) => {
      void resolve;
      if (options.signal.aborted) reject(new DOMException("Aborted sibling", "AbortError"));
      else options.signal.addEventListener("abort", () => reject(new DOMException("Aborted sibling", "AbortError")), { once:true });
    });
  } });
  await find(f); await f.user.click(screen.getByRole("button", { name:"View shared contact" })); await screen.findByText("shared@example.invalid");
  f.data.denialRace = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByText("Confirmed revoked session"); expect(screen.queryByText("Grace Johnson")).toBeNull(); expect(screen.queryByText("shared@example.invalid")).toBeNull();
});
