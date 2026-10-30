import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { it, expect, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import ManagementPage from "../pages/ManagementPage";
import HeaderProfileMenu from "../components/layout/HeaderProfileMenu";
import AppLayout from "../layouts/AppLayout";
const context = { allowed: true, accountId: "admin", username: "management_admin", fullName: "Emmanuel Nyanforh", role: { label: "Management administrator", version: 1, grantedAt: "2026-10-30T12:00:00Z" }, permissions: {},
  tools: [{ key: "credentials", label: "Credential reviews", description: "Unlisted issuer claims", to: "/admin/credentials", allowed: false }, { key: "identity", label: "Identity reviews", description: "ID and selfie submissions", to: "/admin/manual-identity", allowed: true }],
  audits: [{ id: "audit", toEnabled: true, version: 1, reason: "Establish dedicated management access.", createdAt: "2026-10-30T12:00:00Z" }] };
const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } });
function mount(handler, menu = false) {
  const fetch = vi.fn(handler); vi.stubGlobal("fetch", fetch);
  const tree = id => <AuthContext.Provider value={{ account: { id, username: "management_admin", person: { firstName: "Emmanuel", lastName: "Nyanforh" } }, logout: vi.fn() }}><MemoryRouter initialEntries={[menu ? "/profile" : "/superadmin"]}><Routes><Route path="/profile" element={<HeaderProfileMenu hasWork={false} />} /><Route path="/superadmin" element={<ManagementPage />} /></Routes></MemoryRouter></AuthContext.Provider>;
  const view = render(tree("admin")); return { fetch, user: userEvent.setup(), changeAccount: id => view.rerender(tree(id)) };
}
it("management displays verified server context and only links to separately authorized operational workspaces", async () => {
  const f = mount(() => response(context)); await screen.findByRole("heading", { name: "Welcome, Emmanuel Nyanforh" });
  expect(screen.getByRole("link", { name: "Open workspace" }).getAttribute("href")).toBe("/superadmin/identity"); expect(screen.queryByRole("link", { name: /credential reviews/i })).toBeNull();
  const card = screen.getByRole("heading", { name: "Credential reviews" }).closest("article"); expect(within(card).getByText("Separate permission required")).toBeTruthy(); expect(within(card).queryByRole("link")).toBeNull();
  expect(screen.getByText("Establish dedicated management access.")).toBeTruthy(); expect(f.fetch.mock.calls[0]).toMatchObject(["/api/v1/management", { credentials: "include", cache: "no-store" }]);
});
it("denied management access exposes no operator names, audit reasons or operational links", async () => {
  mount(() => response("Management permission and MFA are required.", 403)); await screen.findByRole("alert"); expect(screen.queryByText("Emmanuel Nyanforh")).toBeNull(); expect(screen.queryByText("Establish dedicated management access.")).toBeNull(); expect(screen.queryByRole("link", { name: "Open workspace" })).toBeNull();
});
it.each([{ ...context, accountId: "other" }, { ...context, tools: [{ ...context.tools[1], to: "https://external.invalid/management" }] }])("an untrusted management context cannot populate the workspace: %j", async data => {
  mount(() => response(data)); await screen.findByRole("alert"); expect(screen.queryByText("Welcome, Emmanuel Nyanforh")).toBeNull(); expect(screen.queryByRole("link", { name: "Open workspace" })).toBeNull();
});
it("management focus checks clear sensitive context immediately after role or MFA withdrawal", async () => {
  let denied = false; mount(() => denied ? response("Management permission withdrawn", 403) : response(context)); await screen.findByRole("heading", { name: "Welcome, Emmanuel Nyanforh" });
  denied = true; act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert"); expect(screen.queryByText("Establish dedicated management access.")).toBeNull(); expect(screen.queryByRole("link", { name: "Open workspace" })).toBeNull();
});
it("a late response cannot carry management access to a different account", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); let first = true;
  const f = mount(() => first ? (first = false, pending) : response("Management not permitted", 403)); await waitFor(() => expect(f.fetch).toHaveBeenCalled()); f.changeAccount("other"); await screen.findByRole("alert"); await act(async () => release(response(context))); expect(screen.queryByText("Welcome, Emmanuel Nyanforh")).toBeNull();
});
it("duplicate management refresh clicks cannot issue overlapping reads", async () => {
  let pending = false, release; const wait = new Promise(resolve => { release = resolve; }); const f = mount(() => pending ? wait : response(context)); await screen.findByRole("heading", { name: "Welcome, Emmanuel Nyanforh" });
  pending = true; const button = screen.getByRole("button", { name: "Refresh management access" }); await f.user.click(button); await f.user.click(button); expect(f.fetch.mock.calls).toHaveLength(2); expect(button.disabled).toBe(true); await act(async () => release(response(context))); await waitFor(() => expect(button.disabled).toBe(false));
});
it("the account menu discovers management permission only when opened and closes before navigation", async () => {
  const f = mount(url => url.endsWith("/access") ? response({ allowed: true, accountId: "admin" }) : response(context), true);
  expect(f.fetch).not.toHaveBeenCalled(); await f.user.click(screen.getByRole("button", { name: "Open account menu" })); await f.user.click(await screen.findByRole("button", { name: "BrightWay Management", exact: true })); await screen.findByRole("heading", { name: "Welcome, Emmanuel Nyanforh" });
  expect(f.fetch.mock.calls[0]).toMatchObject(["/api/v1/management/access", { credentials: "include", cache: "no-store" }]); expect(screen.queryByRole("region", { name: "Account menu" })).toBeNull();
});
it.each([{ allowed: false }, { allowed: "true", accountId: "admin" }, { allowed: true, accountId: "foreign" }])("the account menu rejects an unverified management access response: %j", async data => {
  const f = mount(() => response(data), true); await f.user.click(screen.getByRole("button", { name: "Open account menu" })); await waitFor(() => expect(f.fetch).toHaveBeenCalled()); await act(async () => {}); expect(screen.queryByRole("button", { name: "BrightWay Management", exact: true })).toBeNull();
});
it("a temporary access-discovery failure never exposes a management entry", async () => {
  const f = mount(() => response("Management unavailable", 503), true); await f.user.click(screen.getByRole("button", { name: "Open account menu" })); await waitFor(() => expect(f.fetch).toHaveBeenCalled()); await act(async () => {}); expect(screen.queryByRole("button", { name: "BrightWay Management", exact: true })).toBeNull();
});

it("the management shell shows only granted operational navigation and clears it after permission withdrawal", async () => {
  let denied = false;
  vi.stubGlobal("fetch", vi.fn(async url => url.endsWith("/profile/me") ? response({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } }) : url.endsWith("/work/access") ? response({ hasWork: false }) : denied ? response("Management permission withdrawn", 403) : response(context)));
  render(<AuthContext.Provider value={{ account: { id: "admin", username: "management_admin", person: { firstName: "Emmanuel", lastName: "Nyanforh" } } }}><MemoryRouter initialEntries={["/superadmin"]}><Routes><Route element={<AppLayout />}><Route path="/superadmin" element={<ManagementPage />} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
  const nav = await screen.findByRole("navigation", { name: "Management tools" });
  expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual(["Overview", "Identity reviews"]); expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  expect(document.querySelector(".bw-design-personal").textContent).toContain("BrightWay Management");
  const future = screen.getByRole("navigation", { name: "Planned management tools" }); expect(within(future).getAllByRole("button").every(button => button.disabled)).toBe(true);
  expect(within(screen.getByRole("navigation", { name: "Mobile management navigation" })).getAllByRole("link")).toHaveLength(3);
  denied = true; act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert"); expect(screen.queryByRole("navigation", { name: "Management tools" })).toBeNull(); expect(screen.queryByRole("link", { name: "Open workspace" })).toBeNull();
});
