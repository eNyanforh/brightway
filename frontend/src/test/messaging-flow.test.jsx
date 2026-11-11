import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import { ManagementContext } from "../auth/management-context";
import MessagesPage, { OfficialMessagesPage } from "../pages/MessagesPage";
import NotificationsPage from "../pages/NotificationsPage";
const cid = "33333333-3333-4333-8333-333333333333", mid = "44444444-4444-4444-8444-444444444444";
const convo = { id: cid, kind: "DIRECT", counterpart: { fullName: "Alice Johnson", username: "alice" }, canSend: true, unread: 0, latest: null };
const msg = { sequence: "1", id: mid, conversationId: cid, sender: { fullName: "Alice Johnson" }, own: false, body: "Let us discuss our scholarship", state: "SENT", createdAt: "2026-11-11T12:00:00Z", deliveredAt: null, readAt: null, attachments: [], share: null };
const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } }));
function fixture(handler = () => null) {
  const fetch = vi.fn((url, options = {}) => {
    const handled = handler(url, options); if (handled) return handled;
    if (url.includes("/preferences")) return reply({ showActive: false, showTyping: true });
    if (url.endsWith("/heartbeat") || url.endsWith("/typing") || url.endsWith("/receipts")) return reply({ saved: true });
    if (url.endsWith("/" + cid)) return reply({ conversation: convo, items: [msg], nextCursor: null, presence: { active: false, typing: false, lastActiveAt: null } });
    return reply({ items: [convo], nextCursor: null });
  }); vi.stubGlobal("fetch", fetch); return fetch;
}
function mount(path = "/messages?conversation=" + cid, component = <MessagesPage />) { render(<AuthContext.Provider value={{ account: { id: "owner" } }}><MemoryRouter initialEntries={[path]}>{component}</MemoryRouter></AuthContext.Provider>); return userEvent.setup(); }
it("opens a connected conversation, delivers received content and only marks it read while focused", async () => {
  const fetch = fixture(); vi.spyOn(document, "hasFocus").mockReturnValue(false);
  mount(); await screen.findByText(msg.body);
  await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith("/receipts") && JSON.parse(options.body).state === "DELIVERED")).toBe(true));
  expect(fetch.mock.calls.some(([url, options]) => url.endsWith("/receipts") && JSON.parse(options.body).state === "READ")).toBe(false);
  vi.spyOn(document, "hasFocus").mockReturnValue(true); window.dispatchEvent(new Event("focus"));
  await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith("/receipts") && JSON.parse(options.body).state === "READ")).toBe(true));
  expect(screen.queryByText(/^Last active /)).toBeNull();
});
it("keeps failed drafts and reuses exactly the same request key on retry", async () => {
  const writes = []; let failing = true;
  fixture((url, options) => { if (url.endsWith("/messages") && options.method === "POST") { const body = JSON.parse(options.body); writes.push(body); return failing ? reply("Network interrupted", 503) : reply({ ...msg, own: true, body: body.body }); } });
  const user = mount(); await screen.findByText(msg.body);
  await user.type(screen.getByRole("textbox", { name: "Message", exact: true }), "My scholarship question");
  await user.click(screen.getByRole("button", { name: "Send", exact: true }));
  await screen.findByText(/Network interrupted/); expect(screen.getByRole("textbox", { name: "Message", exact: true }).value).toBe("My scholarship question");
  expect(screen.queryByLabelText("Message delivered")).toBeNull();
  failing = false; await user.click(screen.getByRole("button", { name: "Retry message" }));
  await waitFor(() => expect(writes.length).toBe(2)); expect(writes[0]).toEqual(writes[1]);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message", exact: true }).value).toBe(""));
});
it("opens new conversations from Network links and keeps failed connection checks visible", async () => {
  fixture((url, options) => options.method === "POST" && url.endsWith("/conversations") ? reply("An accepted connection is required", 403) : null);
  const user = mount("/messages?to=alice");
  expect(screen.getByLabelText("Connected person’s username").value).toBe("alice");
  await user.click(screen.getByRole("button", { name: "Start conversation" }));
  await screen.findByText(/An accepted connection is required/);
  expect(screen.getByLabelText("Connected person’s username").value).toBe("alice");
});
it("removes the composer and private history when realtime access is revoked", async () => {
  let denied = false, stream;
  vi.stubGlobal("EventSource", class { constructor() { stream = this; this.handlers = {}; } addEventListener(name, fn) { this.handlers[name] = fn; } close() {} });
  fixture(url => denied && url.endsWith("/" + cid) ? reply("This conversation is unavailable", 404) : null);
  mount(); await screen.findByText(msg.body); denied = true;
  stream.handlers["access:changed"]({ data: "{}" });
  await waitFor(() => expect(screen.queryByText(msg.body)).toBeNull());
  expect(screen.queryByRole("textbox", { name: "Message", exact: true })).toBeNull();
});

it("official messages select a recipient, send as BrightWay and include an internal reason", async () => {
  const writes = [];
  fixture((url, options) => {
    if (url.includes("/recipients?")) return reply({ items: [{ id: mid, label: "Emmanuel Nyanforh", username: "emmanuel" }] });
    if (url.endsWith("/official-messages") && options.method === "POST") { writes.push(JSON.parse(options.body)); return reply({ conversationId: cid, messageId: mid }); }
    if (url.endsWith("/" + cid)) return reply({ conversation: { ...convo, kind: "OFFICIAL_USER", recipientKind: "USER", recipientId: mid }, items: [], nextCursor: null });
    return null;
  });
  const user = mount("/superadmin/official-messages", <ManagementContext.Provider value={{ staff: { id: "mg_synthetic" } }}><OfficialMessagesPage /></ManagementContext.Provider>);
  await user.click(screen.getByRole("button", { name: "New official message" }));
  await user.type(screen.getByLabelText("Find recipient"), "Emmanuel"); await user.click(screen.getByRole("button", { name: "Search recipients" }));
  await user.click(await screen.findByRole("button", { name: /Emmanuel Nyanforh/ }));
  await user.type(screen.getByLabelText("Official message"), "Welcome to BrightWay"); await user.type(screen.getByLabelText("Internal reason"), "Onboarding assistance");
  await user.click(screen.getByRole("button", { name: "Send as BrightWay" }));
  await waitFor(() => expect(writes.length).toBe(1)); expect(writes[0]).toMatchObject({ recipientKind: "USER", recipientId: mid, body: "Welcome to BrightWay", reason: "Onboarding assistance" });
});
it("global notifications retain exactly All and Unread and render platform links", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply({ items: [{ id: mid, kind: "PLATFORM", title: "You received a new message", href: `/messages?conversation=${cid}`, createdAt: msg.createdAt, readAt: null }], nextCursor: null })));
  mount("/notifications", <NotificationsPage />);
  expect((await screen.findByRole("link", { name: "You received a new message" })).getAttribute("href")).toBe(`/messages?conversation=${cid}`);
  const tabs = screen.getByRole("navigation", { name: "Notification views" });
  expect(within(tabs).getAllByRole("button").map(b => b.textContent)).toEqual(["All", "Unread"]);
});
