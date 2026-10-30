import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import ManagementStatistics from "../components/management/ManagementStatistics";
import ManagementPage from "../pages/ManagementPage";
const data = { accountId: "root", asOf: "2026-10-30T12:00:00.000Z", period: { days: 30, timeZone: "UTC", from: "2026-10-01T00:00:00.000Z", to: "2026-10-30T12:00:00.000Z", sevenDayFrom: "2026-10-23T12:00:00.000Z" }, accounts: { total: 1234, active: 1200, suspended: 20, deactivated: 14, emailVerified: 1000, mfaEnabled: 240, newLast7Days: 15, signedInLast7Days: 420 }, organizations: { total: 12, active: 11, suspended: 1, schools: 7, companies: 3, ngos: 2 }, queues: { organizations: 8, identities: 3, credentials: 11 }, registrations: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, count: i % 4 })) };
const reply = (value = data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data: value } : { message: value }) }), { status, headers: { "Content-Type": "application/json" } });
function mount(handler) { const fetch = vi.fn(handler); vi.stubGlobal("fetch", fetch); const view = render(<ManagementStatistics accountId="root" />); return { fetch, user: userEvent.setup(), changeAccount: id => view.rerender(<ManagementStatistics accountId={id} />) }; }
it("platform statistics show exact totals and an accessible 30-day registration table from authenticated uncached reads", async () => {
  const f = mount(() => reply()); await screen.findByText("1,234"); expect(within(screen.getByText("Active accounts").closest("article")).getByText("1,200")).toBeTruthy(); expect(screen.getByRole("heading", { name: "Account security" })).toBeTruthy();
  expect(f.fetch.mock.calls[0]).toMatchObject(["/api/v1/management/statistics", { credentials: "include", cache: "no-store" }]);
  await f.user.click(screen.getByText("View daily counts")); const table = screen.getByRole("table", { name: "Daily registrations (UTC)" }); expect(within(table).getAllByRole("row")).toHaveLength(31); expect(within(table).getByRole("rowheader", { name: "2026-10-30" })).toBeTruthy();
  expect(screen.getByText(/not current online activity/)).toBeTruthy(); expect(screen.getByText(/Counts do not grant review access/)).toBeTruthy();
});
it("legitimate empty platform data displays real zero totals", async () => {
  const zero = structuredClone(data); for (const group of ["accounts", "organizations", "queues"]) for (const field of Object.keys(zero[group])) zero[group][field] = 0; zero.registrations.forEach(p => { p.count = 0; });
  mount(() => reply(zero)); await screen.findByRole("heading", { name: "Platform overview" }); await waitFor(() => expect(screen.getByText("Total users")).toBeTruthy());
  expect(within(screen.getByText("Total users").closest("article")).getByText("0")).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull();
});
it("an unavailable or forbidden statistics endpoint never becomes a zero-count dashboard", async () => {
  mount(() => reply("Super Admin permission required", 403)); expect((await screen.findByRole("alert")).textContent).toContain("Super Admin permission"); expect(screen.queryByText("Total users")).toBeNull(); expect(screen.queryByRole("img")).toBeNull();
});
it.each([{ ...data, accountId: "other" }, { ...data, accounts: { ...data.accounts, total: 1 } }, { ...data, registrations: data.registrations.slice(1) }])("malformed or foreign statistics fail closed: %j", async value => {
  mount(() => reply(value)); await screen.findByRole("alert"); expect(screen.queryByText("1,234")).toBeNull(); expect(screen.queryByText("Total users")).toBeNull();
});
it("statistics refresh is serialized and a failure removes the previously visible snapshot", async () => {
  let refresh = false, release; const pending = new Promise(resolve => { release = resolve; }); const f = mount(() => refresh ? pending : reply()); await screen.findByText("1,234");
  refresh = true; const button = screen.getByRole("button", { name: "Refresh platform statistics" }); await f.user.click(button); await f.user.click(button); expect(f.fetch.mock.calls).toHaveLength(2); expect(button.disabled).toBe(true);
  await act(async () => release(reply("Statistics unavailable", 503))); await screen.findByRole("alert"); expect(screen.queryByText("1,234")).toBeNull(); expect(screen.queryByText("Total users")).toBeNull();
});
it("a late snapshot cannot carry aggregate data to another signed-in account", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); let first = true;
  const f = mount(() => first ? (first = false, pending) : reply("Permission denied", 403)); await waitFor(() => expect(f.fetch).toHaveBeenCalled()); f.changeAccount("other"); await screen.findByRole("alert"); await act(async () => release(reply())); expect(screen.queryByText("1,234")).toBeNull();
});
it("focus checks withdraw statistics immediately after server permission loss", async () => {
  let revoked = false; mount(() => revoked ? reply("Super Admin access withdrawn", 403) : reply()); await screen.findByText("1,234"); revoked = true; act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert"); expect(screen.queryByText("Total users")).toBeNull();
});
it("ordinary management staff never request or render platform statistics", async () => {
  const context = { allowed: true, accountId: "staff", username: "staff", fullName: "Named Agent", role: { isSuperAdmin: false, label: "Management staff", version: 1 }, tools: [], audits: [] };
  const fetch = vi.fn(() => reply(context)); vi.stubGlobal("fetch", fetch);
  render(<AuthContext.Provider value={{ account: { id: "staff" } }}><MemoryRouter><ManagementPage /></MemoryRouter></AuthContext.Provider>);
  await screen.findByRole("heading", { name: "Welcome, Named Agent" }); expect(fetch.mock.calls.some(([url]) => url.endsWith("/statistics"))).toBe(false); expect(screen.queryByRole("region", { name: "Platform statistics" })).toBeNull();
});
