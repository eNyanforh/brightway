import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import { it, expect, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import AppLayout from "../layouts/AppLayout";
import WorkPage from "../pages/WorkPage";
import OrganizationWorkspacePage from "../pages/OrganizationWorkspacePage";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59", inviteId = "743f9b44-7e5a-4ecb-9e62-1bc1c0844d59", memberId = "643f9b44-7e5a-4ecb-9e62-1bc1c0844d59";
const MANAGE = "organization.members.manage", POSTS = "organization.posts.publish", catalog = [{ key: MANAGE, label: "Manage staff" }, { key: POSTS, label: "Publish posts" }];
const organization = { id, name: "Global school", type: "SCHOOL", offersTraining: true };
const context = { accountId: "owner", organization, permissions: [MANAGE, POSTS], staffVersion: 1, permissionCatalog: catalog, membership: { role: "PRIMARY_ADMIN", version: 1 } };
const staff = { staffVersion: 1, members: [{ id: "primary", username: "owner", role: "PRIMARY_ADMIN", enabled: true, version: 1, permissions: [MANAGE, POSTS] }, { id: memberId, username: "staff", role: "STAFF", enabled: true, version: 1, permissions: [POSTS] }], invitations: [] };
const reply = (data, status = 200) => new Response(JSON.stringify(status >= 400 ? { success: false, message: data } : { success: true, data }), { status, headers: { "Content-Type": "application/json" } });
function mount(handler, path = `/organization-workspace/${id}/staff`, actor = "owner") {
  const fetch = vi.fn(handler); vi.stubGlobal("fetch", fetch); const setActingOrganization = vi.fn();
  const tree = current => <AuthContext.Provider value={{ account: { id: current, username: current } }}><MemoryRouter initialEntries={[path]}><Routes><Route element={<Outlet context={{ setActingOrganization }} />}><Route path="/organization-workspace" element={<OrganizationWorkspacePage />} /><Route path="/work" element={<WorkPage />} /><Route path="/organization-workspace/:id" element={<OrganizationWorkspacePage />} /><Route path="/organization-workspace/:id/staff" element={<OrganizationWorkspacePage section="staff" />} /></Route><Route path="/explore" element={<p>Personal account page</p>} /></Routes></MemoryRouter></AuthContext.Provider>;
  const view = render(tree(actor)); return { fetch, setActingOrganization, user: userEvent.setup(), switchAccount: next => view.rerender(tree(next)) };
}
async function openInvite(f) { const button = await screen.findByRole("button", { name: "Invite staff", exact: true }); await waitFor(() => expect(button.disabled).toBe(false)); await f.user.click(button); }
const defaultRead = url => url.endsWith("/staff") ? reply(staff) : reply(context);
it("opens the server-authorized organization context, protects the primary administrator and switches to Personal", async () => {
  const f = mount(defaultRead); await screen.findByRole("heading", { name: "Global school", level: 1 }); await screen.findByText("Primary administrator");
  expect(f.setActingOrganization).toHaveBeenCalledWith(expect.objectContaining({ accountId: "owner", organization }));
  expect(screen.queryByRole("button", { name: "Save permissions for @owner" })).toBeNull();
  await f.user.click(screen.getByRole("link", { name: "Personal account" })); await screen.findByText("Personal account page"); expect(f.setActingOrganization).toHaveBeenLastCalledWith(null);
});
it("invites by username with explicit permissions, scope version and one cookie-bound request", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const f = mount((url, options) => options?.method === "POST" ? pending : defaultRead(url));
  await openInvite(f); await f.user.type(screen.getByLabelText("BrightWay username"), "new_staff");
  const form = screen.getByLabelText("BrightWay username").closest("form"); await f.user.click(within(form).getByText(/Upcoming capabilities/)); await f.user.click(within(form).getByLabelText("Publish posts")); fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1));
  const [, options] = f.fetch.mock.calls.find(([, o]) => o?.method === "POST"); const body = JSON.parse(options.body); expect(body).toMatchObject({ username: "new_staff", permissions: [POSTS], expectedStaffVersion: 1 }); expect(body.idempotencyKey).toBeTruthy(); expect(options.credentials).toBe("include");
  release(reply({ id: inviteId })); await screen.findByText(/Saved. Organization access/);
});
it("ambiguous delivery retries the identical invitation without accepting edits or duplicating grants", async () => {
  const f = mount((url, options) => options?.method === "POST" ? reply("Response unavailable", 503) : defaultRead(url));
  await openInvite(f); await f.user.type(await screen.findByLabelText("BrightWay username"), "new_staff"); await f.user.click(screen.getByRole("button", { name: "Send invitation" }));
  await f.user.click(await screen.findByRole("button", { name: "Retry same invitation" }));
  await waitFor(() => expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(2)); const writes = f.fetch.mock.calls.filter(([, o]) => o?.method === "POST"); expect(writes[0][1].body).toBe(writes[1][1].body);
});
it("the legacy account-picker URL redirects to My Workspace without fetching the old picker", async () => {
  const f = mount(url => url.includes("/my-workspace") ? reply({ tab: "approved", search: "", counts: { approved: 0, pending: 0, invitations: 0, history: 0 }, items: [] }) : reply({}), "/organization-workspace");
  await screen.findByRole("heading", { name: "My Workspace", level: 1 });
  expect(screen.queryByRole("heading", { name: "Switch account" })).toBeNull();
  expect(f.fetch.mock.calls.some(([url]) => url === "/api/v1/organization-workspace")).toBe(false);
});
it("stale membership edits retain selections and require explicit reload", async () => {
  const f = mount((url, options) => options?.method === "PATCH" ? reply("Staff changed", 409) : defaultRead(url));
  await f.user.click(await screen.findByRole("button", { name: "Manage @staff" }));
  const button = await screen.findByRole("button", { name: "Save permissions for @staff" }), form = button.closest("form");
  await f.user.click(within(form).getByLabelText("Membership enabled")); await f.user.click(within(form).getByLabelText(/I understand this revokes/)); await f.user.click(button); await screen.findByRole("alert"); expect(within(form).getByLabelText("Membership enabled").checked).toBe(false); expect(button.disabled).toBe(true);
});
it("focus rechecks clear private staff immediately when management permission is removed", async () => {
  let revoked = false; const f = mount(url => url.endsWith("/staff") ? reply(staff) : reply(revoked ? { ...context, permissions: [] } : context));
  await f.user.click(await screen.findByRole("button", { name: "Manage @staff" })); await screen.findByRole("dialog"); revoked = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert"); expect(screen.queryByText("@staff")).toBeNull(); expect(screen.queryByLabelText("BrightWay username")).toBeNull(); expect(f.fetch).toHaveBeenCalled();
});
it("a focus refresh during the initial staff read compares against the authorized context before React paints it", async () => {
  let revoked = false;
  const f = mount(url => {
    if (url.endsWith("/staff")) { revoked = true; window.dispatchEvent(new Event("focus")); return reply(staff); }
    return reply(revoked ? { ...context, permissions: [] } : context);
  });
  await screen.findByRole("alert");
  expect(screen.queryByText("@staff")).toBeNull(); expect(screen.queryByLabelText("BrightWay username")).toBeNull();
  expect(f.fetch.mock.calls.filter(([url]) => !url.endsWith("/staff"))).toHaveLength(2);
});
it("a foreign or revoked membership cannot display an organization workspace", async () => {
  const f = mount(() => reply("Active organization membership is required.", 403)); await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "Global school" })).toBeNull(); expect(f.setActingOrganization).not.toHaveBeenCalledWith(expect.objectContaining({ accountId: "owner", organization }));
});
it("account changes discard private staffing data and ignore a late response for the previous account", async () => {
  let release; const late = new Promise(resolve => { release = resolve; }); let initial = true;
  const f = mount(() => initial ? (initial = false, late) : reply("Membership required", 403)); await waitFor(() => expect(f.fetch).toHaveBeenCalled()); f.switchAccount("other"); await screen.findByRole("alert"); await act(async () => release(reply(context))); expect(screen.queryByRole("heading", { name: "Global school" })).toBeNull();
});

function PersonalDraftProbe() {
  const { profileDraft, setProfileDraft } = useOutletContext();
  if (!profileDraft) return <p>Loading personal draft</p>;
  return <><label>Personal headline<input value={profileDraft.form.headline} onChange={e => setProfileDraft(old => ({ ...old, form: { ...old.form, headline: e.target.value } }))} /></label></>;
}

it("organization switching keeps personal drafts separate and reflects the acting organization in the header", async () => {
  const profile = { id: "profile", version: 1, photo: null, headline: "Original headline", bio: null, location: { countryCode: "GH", region: "", locality: "Accra" }, careerField: { mode: "EXPLORING" }, careerGoals: null, skills: [], interests: [] };
  vi.stubGlobal("fetch", vi.fn(async url => url.endsWith("/profile/me") ? reply({ profile }) : url.endsWith("/staff") ? reply(staff) : url.endsWith("/work/access") ? reply({ hasWork: true }) : url.includes("/my-workspace") ? reply({ tab: "approved", search: "", counts: { approved: 1, pending: 0, invitations: 0, history: 0 }, items: [{ ...organization, role: "PRIMARY_ADMIN" }] }) : reply(context)));
  const account = { id: "owner", username: "owner", person: { firstName: "Test", lastName: "Owner" } }, user = userEvent.setup();
  render(<AuthContext.Provider value={{ account }}><MemoryRouter initialEntries={["/explore"]}><Routes><Route element={<AppLayout />}><Route path="/explore" element={<PersonalDraftProbe />} /><Route path="/organization-workspace" element={<OrganizationWorkspacePage />} /><Route path="/work" element={<WorkPage />} /><Route path="/organization-workspace/:id" element={<OrganizationWorkspacePage />} /><Route path="/organization-workspace/:id/staff" element={<OrganizationWorkspacePage section="staff" />} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
  await user.clear(await screen.findByLabelText("Personal headline")); await user.type(screen.getByLabelText("Personal headline"), "Unsaved personal headline");
  await user.click(screen.getByRole("button", { name: "Open account menu" })); expect(screen.queryByRole("button", { name: "Switch account", exact: true })).toBeNull(); await user.click(screen.getByRole("button", { name: "My Workspace", exact: true }));
  await user.click(await screen.findByRole("link", { name: "Manage", exact: true })); await screen.findByRole("heading", { name: "Global school", level: 1 });
  await waitFor(() => expect(document.querySelector(".bw-design-personal").textContent).toContain("Global school"));
  await user.click(screen.getByRole("link", { name: "Personal account", exact: true }));
  expect((await screen.findByLabelText("Personal headline")).value).toBe("Unsaved personal headline"); expect(document.querySelector(".bw-design-personal").textContent).toContain("Personal account");
});

it("searches on the server and carries enabled/revoked filters into the directory request", async () => {
  const f = mount(url => {
    if (!url.includes("/staff")) return reply(context);
    const query = new URL(url, "http://localhost").searchParams;
    const search = query.get("search") || "", memberStatus = query.get("memberStatus") || "all";
    return reply({ ...staff, organizationId: id, search, memberStatus, counts: { all: 2, enabled: 2, revoked: 0, pending: 0 }, members: search === "missing" || memberStatus === "revoked" ? [] : staff.members });
  });
  await screen.findByRole("button", { name: "Manage @staff" });
  await f.user.type(screen.getByLabelText("Search staff by username"), "@MISSING");
  await f.user.click(screen.getByRole("button", { name: "Search staff", exact: true })); await screen.findByText("No matching usernames");
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/staff?search=missing"))).toBe(true);
  await f.user.click(screen.getByRole("button", { name: "Clear search" })); await screen.findByRole("button", { name: "Manage @staff" });
  await f.user.click(screen.getByRole("tab", { name: /Revoked/ })); await screen.findByText("No staff in this view");
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/staff?memberStatus=revoked"))).toBe(true);
});
it("restores access with the revoked member's saved permissions rather than an empty grant", async () => {
  let restored = false;
  const f = mount((url, options) => {
    if (options?.method === "PATCH") { restored = true; return reply({}); }
    return url.endsWith("/staff") ? reply({ ...staff, members: [staff.members[0], { ...staff.members[1], enabled: restored, permissions: restored ? [POSTS] : [], assignedPermissions: [POSTS], canManage: true }] }) : reply(context);
  });
  await f.user.click(await screen.findByRole("button", { name: "Manage @staff" }));
  const dialog = screen.getByRole("dialog"); await f.user.click(within(dialog).getByText(/Upcoming capabilities/));
  expect(within(dialog).getByLabelText("Publish posts").checked).toBe(true);
  await f.user.click(within(dialog).getByLabelText("Membership enabled")); await f.user.click(within(dialog).getByRole("button", { name: "Save permissions for @staff" }));
  await screen.findByText(/Saved. Organization access/);
  const call = f.fetch.mock.calls.find(([, options]) => options?.method === "PATCH"); expect(JSON.parse(call[1].body)).toMatchObject({ enabled: true, permissions: [POSTS], expectedVersion: 1, expectedStaffVersion: 1 });
});
it("cannot submit, dismiss or change an invitation again while its first request is pending", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = mount((url, options) => options?.method === "POST" ? pending : defaultRead(url));
  await openInvite(f); await f.user.type(screen.getByLabelText("BrightWay username"), "new_staff");
  const form = screen.getByLabelText("BrightWay username").closest("form"); fireEvent.submit(form); fireEvent.submit(form);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.getByRole("dialog")).toBeTruthy(); expect(screen.getByLabelText("BrightWay username").disabled).toBe(true);
  expect(f.fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  await act(async () => release(reply({ id: inviteId }))); await screen.findByText(/Saved. Organization access/); expect(screen.queryByRole("dialog")).toBeNull();
});
it("invalid invite recipients keep the editable draft and do not force a stale reload", async () => {
  const f = mount((url, options) => options?.method === "POST" ? reply("Choose an active BrightWay username.", 400) : defaultRead(url));
  await openInvite(f); await f.user.type(screen.getByLabelText("BrightWay username"), "wrong_name"); await f.user.click(screen.getByRole("button", { name: "Send invitation" }));
  await screen.findByRole("alert"); expect(screen.getByLabelText("BrightWay username").value).toBe("wrong_name"); expect(screen.getByLabelText("BrightWay username").disabled).toBe(false);
  expect(screen.getByRole("button", { name: "Send invitation" }).disabled).toBe(false);
});
it("cancelling an invitation requires explicit confirmation and does not grant membership", async () => {
  let cancelled = false;
  const f = mount((url, options) => options?.method === "POST" ? (cancelled = true, reply({})) : url.endsWith("/staff") ? reply({ ...staff, invitations: cancelled ? [] : [{ id: inviteId, username: "new_staff", permissions: [POSTS], state: "PENDING", version: 2, expiresAt: "2026-11-06T12:00:00Z" }] }) : reply(context));
  await screen.findByRole("button", { name: "Manage @staff" }); await f.user.click(screen.getByRole("tab", { name: "Invitations" }));
  await f.user.click(screen.getByRole("button", { name: "Cancel invitation for @new_staff" }));
  expect(f.fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  await f.user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel invitation", exact: true })); await screen.findByText("No pending invitations");
  const call = f.fetch.mock.calls.find(([, options]) => options?.method === "POST"); expect(call[0]).toContain(`/invitations/${inviteId}/cancel`); expect(JSON.parse(call[1].body)).toEqual({ expectedVersion: 2, expectedStaffVersion: 1 });
});
it("a temporary focus failure keeps unsaved permission edits and requires explicit reconciliation", async () => {
  let failed = false; const f = mount(url => url.endsWith("/staff") && failed ? reply("Staff temporarily unavailable", 503) : defaultRead(url));
  await f.user.click(await screen.findByRole("button", { name: "Manage @staff" }));
  await f.user.click(screen.getByLabelText("Membership enabled")); failed = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert"); expect(screen.getByRole("dialog")).toBeTruthy(); expect(screen.getByLabelText("Membership enabled").checked).toBe(false);
  expect(screen.getByRole("button", { name: "Save permissions for @staff" }).disabled).toBe(true);
});
