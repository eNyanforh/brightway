import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import OrganizationOverview from "../components/organizations/OrganizationOverview";
import { dashboardFixture } from "./fixtures/organization-dashboard";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59", organization = { id, name: "Synthetic Academy", type: "SCHOOL" };
const reply = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } });
function mount(handler = (_url, days) => reply(dashboardFixture(id, days))) {
  const fetch = vi.fn((url, options) => handler(url, Number(new URL(url, "http://localhost").searchParams.get("days")), options)); vi.stubGlobal("fetch", fetch);
  const tree = (org = organization, refreshVersion = "1") => <MemoryRouter><OrganizationOverview organization={org} role="PRIMARY_ADMIN" refreshVersion={refreshVersion} /></MemoryRouter>;
  const result = render(tree()); return { fetch, user: userEvent.setup(), rerender: (org, version) => result.rerender(tree(org, version)) };
}
it("shows real scoped snapshots/trends with accessible data and no duplicate tool cards", async () => {
  const f = mount(); await screen.findByRole("heading", { name: "Review activity" });
  expect(within(screen.getByRole("region", { name: "Enabled members" })).getByText("8")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Open reviews" })).getByText("6")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open Profile" })).toBeNull(); expect(screen.queryByRole("link", { name: "Open Staff" })).toBeNull();
  expect(screen.getByRole("link", { name: "Unassigned submissions" }).getAttribute("href")).toBe(`/organization-workspace/${id}/credentials?filter=unassigned`);
  expect(screen.getByRole("link", { name: "Past review target" }).getAttribute("href")).toBe(`/organization-workspace/${id}/credentials?filter=past_target`);
  await f.user.click(screen.getByText("View chart data")); expect(screen.getByRole("table")).toBeTruthy();
  const [, options] = f.fetch.mock.calls[0]; expect(options.credentials).toBe("include"); expect(options.cache).toBe("no-store");
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it("period changes discard a late older response instead of relabeling its counts", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = mount((_url, days) => days === 7 ? pending : reply(dashboardFixture(id, days)));
  await screen.findByRole("heading", { name: "Review activity" });
  await f.user.selectOptions(screen.getByLabelText("Reporting period"), "7"); await screen.findByRole("status");
  expect(screen.queryByRole("heading", { name: "Review activity" })).toBeNull();
  await f.user.selectOptions(screen.getByLabelText("Reporting period"), "90");
  await screen.findByText("Unique claims · last 90 days");
  await act(async () => release(reply(dashboardFixture(id, 7))));
  expect(screen.queryByText("Unique claims · last 7 days")).toBeNull(); expect(screen.getByLabelText("Reporting period").value).toBe("90");
});
it("MFA restrictions show locked statistics without inventing zeros", async () => {
  mount((_url, days) => reply(dashboardFixture(id, days, "mfa_required")));
  await screen.findByText("Sensitive statistics are locked. Verify your email and sign in with two-factor authentication.");
  expect(screen.getAllByText("Locked")).toHaveLength(4); expect(screen.queryByRole("img", { name: /Review activity/ })).toBeNull();
  expect(screen.queryByText("0")).toBeNull();
});
it("review-only access never displays staffing totals and uses only the granted credential scope", async () => {
  mount((_url, days) => { const data = dashboardFixture(id, days); data.team = { access: "permission_required" }; data.reviews.kinds = ["education"]; return reply(data); });
  await screen.findByRole("heading", { name: "Review activity" });
  expect(within(screen.getByRole("region", { name: "Enabled members" })).getByText("Restricted")).toBeTruthy();
  expect(screen.queryByText("Invitations expiring soon")).toBeNull(); expect(screen.getByText(/Education claims submitted/)).toBeTruthy();
});
it("an allowed empty period is an explicit empty chart, not a failure or fabricated data", async () => {
  mount((_url, days) => { const data = dashboardFixture(id, days); const stats = data.reviews.data;
    stats.newClaims = 0; stats.completedClaims = 0; stats.medianHours = null; stats.trend.forEach(p => { p.submissions = 0; p.decisions = 0; });
    Object.keys(stats.outcomes).forEach(key => { stats.outcomes[key] = 0; }); return reply(data); });
  await screen.findByText("No review activity in this period"); expect(screen.queryByRole("alert")).toBeNull();
});
it("a failed refresh clears sensitive figures and retry restores only the new successful snapshot", async () => {
  let failed = false;
  const f = mount((_url, days) => failed ? reply("Statistics are temporarily unavailable.", 503) : reply(dashboardFixture(id, days)));
  await screen.findByRole("heading", { name: "Review activity" }); failed = true;
  act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Enabled members" })).toBeNull(); expect(screen.queryByRole("heading", { name: "Review activity" })).toBeNull();
  failed = false; await f.user.click(screen.getByRole("button", { name: "Retry statistics" })); await screen.findByRole("heading", { name: "Review activity" });
});
it("a foreign/malformed response cannot populate Dashboard analytics", async () => {
  mount((_url, days) => reply(dashboardFixture("foreign-organization", days)));
  await screen.findByRole("alert"); expect(screen.queryByRole("region", { name: "Enabled members" })).toBeNull();
});
it("organization changes hide the old snapshot immediately and ignore its late request", async () => {
  let release; const late = new Promise(resolve => { release = resolve; });
  const other = { ...organization, id: "other-organization" };
  const f = mount((url, days) => url.includes(other.id) ? reply(dashboardFixture(other.id, days, "permission_required")) : late);
  await screen.findByRole("status"); f.rerender(other);
  await screen.findByRole("heading", { name: "Analytics access is limited" });
  await act(async () => release(reply(dashboardFixture(id)))); expect(screen.queryByRole("heading", { name: "Review activity" })).toBeNull();
});
