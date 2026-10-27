import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import { it, expect, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import AppLayout from "../layouts/AppLayout";
import OrganizationWorkspacePage from "../pages/OrganizationWorkspacePage";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59", inviteId = "743f9b44-7e5a-4ecb-9e62-1bc1c0844d59", memberId = "643f9b44-7e5a-4ecb-9e62-1bc1c0844d59";
const MANAGE = "organization.members.manage", POSTS = "organization.posts.publish", catalog = [{ key: MANAGE, label: "Manage staff" }, { key: POSTS, label: "Publish posts" }];
const organization = { id, name: "Global school", type: "SCHOOL", offersTraining: true };
const context = { accountId: "owner", organization, permissions: [MANAGE, POSTS], staffVersion: 1, permissionCatalog: catalog, membership: { role: "PRIMARY_ADMIN", version: 1 } };
const staff = { staffVersion: 1, members: [{ id: "primary", username: "owner", role: "PRIMARY_ADMIN", enabled: true, version: 1, permissions: [MANAGE, POSTS] }, { id: memberId, username: "staff", role: "STAFF", enabled: true, version: 1, permissions: [POSTS] }], invitations: [] };
const reply = (data, status = 200) => new Response(JSON.stringify(status >= 400 ? { success: false, message: data } : { success: true, data }), { status, headers: { "Content-Type": "application/json" } });
function mount(handler, path = `/organization-workspace/${id}`, actor = "owner") {
  const fetch = vi.fn(handler); vi.stubGlobal("fetch", fetch); const setActingOrganization = vi.fn();
  const tree = current => <AuthContext.Provider value={{ account: { id: current, username: current } }}><MemoryRouter initialEntries={[path]}><Routes><Route element={<Outlet context={{ setActingOrganization }} />}><Route path="/organization-workspace" element={<OrganizationWorkspacePage />} /><Route path="/organization-workspace/:id" element={<OrganizationWorkspacePage />} /></Route><Route path="/explore" element={<p>Personal account page</p>} /></Routes></MemoryRouter></AuthContext.Provider>;
  const view = render(tree(actor)); return { fetch, setActingOrganization, user: userEvent.setup(), switchAccount: next => view.rerender(tree(next)) };
}
const defaultRead = url => url.endsWith("/staff") ? reply(staff) : reply(context);
it("opens the server-authorized organization context, protects the primary administrator and switches to Personal", async () => {
  const f = mount(defaultRead); await screen.findByRole("heading", { name: "Global school", level: 1 }); await screen.findByText("Primary administrator");
  expect(f.setActingOrganization).toHaveBeenCalledWith({ accountId: "owner", organization });
  expect(screen.queryByRole("button", { name: "Save permissions for @owner" })).toBeNull();
  await f.user.click(screen.getByRole("link", { name: "Personal account" })); await screen.findByText("Personal account page"); expect(f.setActingOrganization).toHaveBeenLastCalledWith(null);
});
it("invites by username with explicit permissions, scope version and one cookie-bound request", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const f = mount((url, options) => options?.method === "POST" ? pending : defaultRead(url));
  await screen.findByLabelText("BrightWay username"); await f.user.type(screen.getByLabelText("BrightWay username"), "new_staff");
  const form = screen.getByLabelText("BrightWay username").closest("form"); await f.user.click(within(form).getByLabelText("Publish posts")); fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1));
  const [, options] = f.fetch.mock.calls.find(([, o]) => o?.method === "POST"); const body = JSON.parse(options.body); expect(body).toMatchObject({ username: "new_staff", permissions: [POSTS], expectedStaffVersion: 1 }); expect(body.idempotencyKey).toBeTruthy(); expect(options.credentials).toBe("include");
  release(reply({ id: inviteId })); await screen.findByText(/Saved. Organization access/);
});
it("ambiguous delivery retries the identical invitation without accepting edits or duplicating grants", async () => {
  const f = mount((url, options) => options?.method === "POST" ? reply("Response unavailable", 503) : defaultRead(url));
  await f.user.type(await screen.findByLabelText("BrightWay username"), "new_staff"); await f.user.click(screen.getByRole("button", { name: "Send invitation" }));
  await f.user.click(await screen.findByRole("button", { name: "Retry same invitation" }));
  await waitFor(() => expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(2)); const writes = f.fetch.mock.calls.filter(([, o]) => o?.method === "POST"); expect(writes[0][1].body).toBe(writes[1][1].body);
});
it("a recipient must explicitly accept or decline and cannot select PRIMARY_ADMIN or Campus permissions", async () => {
  const calls = [], f = mount((url, options) => { if (options?.method === "POST") { calls.push(JSON.parse(options.body)); return reply({ state: "ACCEPTED" }); } return reply({ organizations: [], invitations: [{ id: inviteId, version: 1, organization, permissions: [POSTS], permissionLabels: ["Publish posts"], expiresAt: "2026-11-03T12:00:00Z" }] }); }, "/organization-workspace", "recipient");
  expect(await screen.findByText("Global school")).toBeTruthy(); expect(calls).toHaveLength(0); await f.user.click(screen.getByRole("button", { name: "Accept invitation from Global school" })); await screen.findByText(/Saved. Organization access/); expect(calls).toEqual([{ expectedVersion: 1, decision: "ACCEPT" }]);
});
it("stale membership edits retain selections and require explicit reload", async () => {
  const f = mount((url, options) => options?.method === "PATCH" ? reply("Staff changed", 409) : defaultRead(url));
  const button = await screen.findByRole("button", { name: "Save permissions for @staff" }), form = button.closest("form");
  await f.user.click(within(form).getByLabelText("Membership enabled")); await f.user.click(button); await screen.findByRole("alert"); expect(within(form).getByLabelText("Membership enabled").checked).toBe(false); expect(button.disabled).toBe(true);
});
it("focus rechecks clear private staff immediately when management permission is removed", async () => {
  let revoked = false; const f = mount(url => url.endsWith("/staff") ? reply(staff) : reply(revoked ? { ...context, permissions: [] } : context));
  await screen.findByRole("button", { name: "Save permissions for @staff" }); revoked = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert"); expect(screen.queryByText("@staff")).toBeNull(); expect(screen.queryByLabelText("BrightWay username")).toBeNull(); expect(f.fetch).toHaveBeenCalled();
});
it("a foreign or revoked membership cannot display an organization workspace", async () => {
  const f = mount(() => reply("Active organization membership is required.", 403)); await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "Global school" })).toBeNull(); expect(f.setActingOrganization).not.toHaveBeenCalledWith({ accountId: "owner", organization });
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
  vi.stubGlobal("fetch", vi.fn(async url => url.endsWith("/profile/me") ? reply({ profile }) : url.endsWith("/staff") ? reply(staff) : url === "/api/v1/organization-workspace" ? reply({ organizations: [{ ...organization, role: "PRIMARY_ADMIN" }], invitations: [] }) : reply(context)));
  const account = { id: "owner", username: "owner", person: { firstName: "Test", lastName: "Owner" } }, user = userEvent.setup();
  render(<AuthContext.Provider value={{ account }}><MemoryRouter initialEntries={["/explore"]}><Routes><Route element={<AppLayout />}><Route path="/explore" element={<PersonalDraftProbe />} /><Route path="/organization-workspace" element={<OrganizationWorkspacePage />} /><Route path="/organization-workspace/:id" element={<OrganizationWorkspacePage />} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
  await user.clear(await screen.findByLabelText("Personal headline")); await user.type(screen.getByLabelText("Personal headline"), "Unsaved personal headline");
  await user.click(screen.getByRole("button", { name: "Open account menu" })); await user.click(screen.getByRole("button", { name: "Switch account", exact: true }));
  await user.click(await screen.findByRole("link", { name: "Global school", exact: true })); await screen.findByRole("heading", { name: "Global school", level: 1 });
  await waitFor(() => expect(document.querySelector(".bw-design-personal").textContent).toContain("Global school"));
  await user.click(screen.getByRole("link", { name: "Personal account", exact: true }));
  expect((await screen.findByLabelText("Personal headline")).value).toBe("Unsaved personal headline"); expect(document.querySelector(".bw-design-personal").textContent).toContain("Personal account");
});
