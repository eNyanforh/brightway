import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { it, expect, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import WorkPage from "../pages/WorkPage";
import OrganizationRequestsPage from "../pages/OrganizationRequestsPage";
import AppLayout from "../layouts/AppLayout";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59", org = "c9818628-8ca8-49d3-8050-e762f15f3401";
const request = { id, name: "Bright Future School", type: "SCHOOL", representativeRole: "Principal", version: 3, status: "RECOMMENDED", targetAt: "2026-10-31T12:00:00Z", location: { countryCode: "GH", city: "Accra", address: "Synthetic street", region: "" }, offersTraining: true };
const reply = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } });
function mount({ path = "/work?tab=pending", requests = [request], organizations = [], invitations = [], custom, hasWork = true } = {}) {
  const fetchMock = vi.fn((url, options) => {
    const result = custom?.(url, options); if (result !== undefined) return result;
    if (url.endsWith("/profile/me")) return reply({ profile: { version: 1, location: {}, photo: null, interests: [], skills: [] } });
    if (url.endsWith("/work/access")) return reply({ hasWork });
    if (url.includes("/my-workspace")) {
      const params = new URL(url, "https://brightway.test").searchParams, tab = params.get("tab") || "approved", search = params.get("search") || "";
      const groups = { approved: organizations, pending: requests.filter(r => ["SUBMITTED", "ASSIGNED", "RECOMMENDED"].includes(r.status)), history: requests.filter(r => ["ABORTED", "REJECTED"].includes(r.status)), invitations };
      const filtered = Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.filter(row => (row.organization?.name || row.name).toLowerCase().includes(search.toLowerCase()))]));
      return reply({ tab, search, counts: Object.fromEntries(Object.entries(filtered).map(([key, rows]) => [key, rows.length])), items: filtered[tab], nextCursor: null });
    }
    if (url.endsWith("/organization-requests")) return reply({ requests });
    if (url.endsWith("/organization-workspace")) return reply({ organizations, invitations: [] });
    if (url.endsWith(id)) return reply(request);
    return reply({});
  }); vi.stubGlobal("fetch", fetchMock);
  const tree = actor => <AuthContext.Provider value={{ account: { id: actor, username: actor, person: { firstName: "Synthetic", lastName: "User" } } }}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout />}><Route path="/work" element={<WorkPage />} /><Route path="/work/requests/:id/edit" element={<OrganizationRequestsPage />} /><Route path="/organizations/new" element={<OrganizationRequestsPage />} /><Route path="/explore" element={<p>Explore destination</p>} /><Route path="/organization-workspace/:id" element={<p>Scoped organization workspace</p>} /></Route></Routes></MemoryRouter></AuthContext.Provider>;
  const view = render(tree("owner")); return { fetchMock, user: userEvent.setup(), switchAccount: () => view.rerender(tree("other")) };
}
it("My Workspace appears immediately after Learning only for persisted organization participation", async () => {
  mount(); const nav = screen.getByRole("navigation", { name: "Main navigation" });
  const link = await within(nav).findByRole("link", { name: "My Workspace" }); expect(link.previousElementSibling.textContent).toContain("Learning");
  expect(screen.getByRole("heading", { name: "My Workspace", level: 1 })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Work tabs" })).toBeNull();
  expect(screen.getByRole("link", { name: "Create an organization" }).getAttribute("href")).toBe("/organizations/new");
});
it("first use keeps the original interest entry and submission reveals My Workspace plus confirmation without another form", async () => {
  let applied = false;
  const f = mount({ path: "/organizations/new", requests: [], hasWork: false, custom: (url, options) => {
    if (url.endsWith("/work/access")) return reply({ hasWork: applied });
    if (options?.method === "POST") { applied = true; return reply({ ...request, status: "SUBMITTED", version: 1 }); }
  } });
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryByRole("link", { name: "My Workspace" })).toBeNull();
  await f.user.type(await screen.findByLabelText("Organization name"), request.name); await f.user.type(screen.getByLabelText("Your representative role"), "Principal"); await f.user.selectOptions(screen.getByLabelText("Country of operation"), "GH"); await f.user.type(screen.getByLabelText("City / locality"), "Accra"); await f.user.type(screen.getByLabelText("Operating address"), "Synthetic street");
  fireEvent.submit(screen.getByLabelText("Organization name").closest("form"));
  await screen.findByText(/Your interest to register.*Bright Future School.*is submitted for review in 72 hours/);
  expect(screen.queryByLabelText("Organization name")).toBeNull(); expect(screen.getByRole("link", { name: "View Progress" }).getAttribute("href")).toBe(`/work?tab=pending#request-${id}`);
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "My Workspace" })).toBeTruthy();
  await f.user.click(screen.getByRole("button", { name: "Create another organization" })); expect((await screen.findByLabelText("Organization name")).value).toBe("");
});
it("My Workspace combines pending requests and memberships, deduplicates approved requests and provides real review-stage progress", async () => {
  mount({ requests: [request, { ...request, id: "approved", organizationId: org, status: "APPROVED" }], organizations: [{ id: org, name: "Approved Employer", role: "STAFF" }] });
  const f = { user: userEvent.setup() };
  const progress = await screen.findByRole("progressbar", { name: `${request.name} review progress` }); expect(progress.value).toBe(75);
  await f.user.click(screen.getByRole("button", { name: /Approved/ }));
  expect(await screen.findByRole("heading", { name: "Approved Employer" })).toBeTruthy(); expect(screen.getByText("Staff")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Manage" })).toHaveLength(1); expect(screen.getByRole("link", { name: "Manage" }).getAttribute("href")).toBe(`/organization-workspace/${org}`);
  await f.user.click(screen.getByRole("button", { name: /Pending/ }));
  expect((await screen.findByRole("link", { name: "Edit" })).getAttribute("href")).toBe(`/work/requests/${id}/edit`);
});
it("Abort requires confirmation, cannot double-submit, and replaces progress with withdrawn status", async () => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  const rows = [{ ...request }];
  const f = mount({ requests: rows, custom: (url, options) => options?.method === "POST" ? pending : undefined });
  await f.user.click(await screen.findByRole("button", { name: "Abort" }));
  const dialog = screen.getByRole("dialog"); expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Keep request" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Abort request" })); fireEvent.click(within(dialog).getByRole("button", { name: "Withdrawing…" }));
  expect(f.fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  await act(async () => { rows[0].status = "ABORTED"; resolve(reply({ ...request, status: "ABORTED", version: 4 })); });
  await screen.findByRole("heading", { name: "No pending requests" });
  await f.user.click(screen.getByRole("button", { name: /Request history/ }));
  await screen.findByText("Aborted by you"); expect(screen.queryByRole("progressbar")).toBeNull(); expect(screen.queryByRole("button", { name: "Abort" })).toBeNull();
});
it("cancelling Abort makes no request and stale failures require a fresh read", async () => {
  const f = mount({ custom: (url, options) => options?.method === "POST" ? reply("This request changed. Reload.", 409) : undefined });
  await f.user.click(await screen.findByRole("button", { name: "Abort" })); await f.user.click(screen.getByRole("button", { name: "Keep request" })); expect(f.fetchMock.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  await f.user.click(screen.getByRole("button", { name: "Abort" })); await f.user.click(screen.getByRole("button", { name: "Abort request" }));
  await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "Abort" }).disabled).toBe(true); expect(screen.getByRole("link", { name: "Edit" }).getAttribute("aria-disabled")).toBe("true");
});
it("editing loads only the owner's request, keeps fields after a stale save and never auto-retries", async () => {
  const f = mount({ path: `/work/requests/${id}/edit`, custom: (url, options) => options?.method === "PATCH" ? reply("Organization request changed.", 409) : undefined });
  const name = await screen.findByLabelText("Organization name"); expect(name.value).toBe(request.name); await f.user.clear(name); await f.user.type(name, "Corrected school");
  await f.user.click(screen.getByRole("button", { name: "Save organization changes" })); await screen.findByRole("alert"); expect(name.value).toBe("Corrected school"); expect(screen.getByRole("button", { name: "Save organization changes" }).disabled).toBe(true);
  const calls = f.fetchMock.mock.calls.filter(([, o]) => o?.method === "PATCH"); expect(calls).toHaveLength(1); expect(JSON.parse(calls[0][1].body)).toMatchObject({ expectedVersion: 3, name: "Corrected school" });
});
it("account changes and rejected focus checks clear private organization cards", async () => {
  let denied = false;
  mount({ custom: url => denied && (url.includes("/my-workspace")) ? reply("Sign in again", 401) : undefined });
  await screen.findByRole("heading", { name: request.name }); denied = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: request.name })).toBeNull();
});
it("a delayed pre-submission workspace lookup cannot hide navigation after the confirmed first interest", async () => {
  let release; const delayed = new Promise(resolve => { release = resolve; });
  const f = mount({ path: "/organizations/new", hasWork: false, custom: (url, options) => url.endsWith("/work/access") ? delayed : options?.method === "POST" ? reply(request) : undefined });
  await f.user.type(await screen.findByLabelText("Organization name"), request.name); await f.user.type(screen.getByLabelText("Your representative role"), "Principal"); await f.user.selectOptions(screen.getByLabelText("Country of operation"), "GH"); await f.user.type(screen.getByLabelText("City / locality"), "Accra"); await f.user.type(screen.getByLabelText("Operating address"), "Synthetic street");
  await f.user.click(screen.getByRole("button", { name: "Submit organization request" })); await screen.findByRole("heading", { name: "Interest submitted" });
  await act(async () => release(reply({ hasWork: false })));
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "My Workspace" })).toBeTruthy();
});

it("search is sent to the server for the selected category and resets paging", async () => {
  const f = mount({ path: "/work", organizations: [{ id: org, name: "Approved Employer", role: "STAFF" }] });
  await screen.findByRole("heading", { name: "Approved Employer" });
  await f.user.type(screen.getByLabelText("Search organizations"), "missing name");
  await screen.findByRole("heading", { name: "No organizations found" });
  const call = f.fetchMock.mock.calls.filter(([url]) => url.includes("/my-workspace")).at(-1);
  expect(new URL(call[0], "https://brightway.test").searchParams.get("search")).toBe("missing name");
  expect(new URL(call[0], "https://brightway.test").searchParams.get("tab")).toBe("approved");
  expect(call[1].credentials).toBe("include");
  await f.user.click(screen.getByRole("button", { name: "Clear search" })); await screen.findByRole("heading", { name: "Approved Employer" });
});
it("Approved is the default, categories separate requests, and redundant switching links are absent", async () => {
  const f = mount({ path: "/work", organizations: [{ id: org, name: "Approved Employer", role: "STAFF" }], requests: [request, { ...request, id: "history", name: "Rejected school", status: "REJECTED" }] });
  await screen.findByRole("heading", { name: "Approved Employer" });
  expect(screen.queryByRole("heading", { name: request.name })).toBeNull();
  expect(screen.queryByRole("link", { name: /staff invitations and switch/ })).toBeNull();
  expect(screen.getByRole("button", { name: /Approved/ }).getAttribute("aria-current")).toBe("page");
  await f.user.click(screen.getByRole("button", { name: /Pending/ })); await screen.findByRole("heading", { name: request.name });
  await f.user.click(screen.getByRole("button", { name: /Request history/ })); await screen.findByRole("heading", { name: "Rejected school" });
  expect(screen.queryByRole("button", { name: "Abort" })).toBeNull();
});
it("invitation acceptance is single-flight and moves the organization into Approved", async () => {
  let accepted = false, release; const waiting = new Promise(resolve => { release = resolve; });
  const invitation = { id, version: 2, organization: { id: org, name: "Inviting School" }, permissions: [], permissionLabels: ["Publish posts"], expiresAt: "2026-11-02" };
  const f = mount({ path: "/work?tab=invitations", invitations: [invitation], custom: (url, options) => {
    if (options?.method === "POST") return waiting;
    if (accepted && url.includes("/my-workspace")) return reply({ tab: "approved", search: "", counts: { approved: 1, pending: 0, invitations: 0, history: 0 }, items: [{ id: org, name: "Inviting School", role: "STAFF" }] });
  } });
  const button = await screen.findByRole("button", { name: "Accept invitation from Inviting School" });
  fireEvent.click(button); fireEvent.click(button);
  const calls = f.fetchMock.mock.calls.filter(([, options]) => options?.method === "POST"); expect(calls).toHaveLength(1); expect(JSON.parse(calls[0][1].body)).toEqual({ expectedVersion: 2, decision: "ACCEPT" });
  await act(async () => { accepted = true; release(reply({ state: "ACCEPTED" })); });
  await screen.findByRole("link", { name: "Manage" }); expect(screen.getByRole("button", { name: /Approved/ }).getAttribute("aria-current")).toBe("page");
});
it("a failed invitation response preserves the invitation and requires reload without replay", async () => {
  const f = mount({ path: "/work?tab=invitations", invitations: [{ id, version: 1, organization: { id: org, name: "Inviting School" }, permissionLabels: [], expiresAt: "2026-11-02" }], custom: (url, options) => options?.method === "POST" ? reply("Invitation changed", 409) : undefined });
  await f.user.click(await screen.findByRole("button", { name: "Decline invitation from Inviting School" }));
  await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "Accept invitation from Inviting School" }).disabled).toBe(true);
  expect(f.fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});

it("a failed background refresh retains the workspace but blocks edits until a successful reload", async () => {
  let offline = false;
  const f = mount({ custom: url => offline && url.includes("/my-workspace") ? reply("Service temporarily unavailable", 503) : undefined });
  await screen.findByRole("heading", { name: request.name });
  offline = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: request.name })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Abort", exact: true }).disabled).toBe(true);
  expect(screen.getByRole("link", { name: "Edit" }).getAttribute("aria-disabled")).toBe("true");
  offline = false; await f.user.click(screen.getByRole("button", { name: "Reload workspaces" }));
  await screen.findByRole("button", { name: "Abort", exact: true });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Abort", exact: true }).disabled).toBe(false);
});
