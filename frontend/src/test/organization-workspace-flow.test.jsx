import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import AppLayout from "../layouts/AppLayout";
import OrganizationWorkspacePage from "../pages/OrganizationWorkspacePage";
import WorkPage from "../pages/WorkPage";
import OrganizationRequestsPage from "../pages/OrganizationRequestsPage";
import CredentialReviewsPage from "../pages/CredentialReviewsPage";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59", base = `/organization-workspace/${id}`;
const MANAGE = "organization.members.manage", REVIEW = "organization.credentials.education.review";
const organization = { id, name: "Verified Test School", type: "SCHOOL", offersTraining: true };
const available = [
  { key: "overview", label: "Overview", icon: "explore", shortLabel: "Overview", to: base },
  { key: "profile", label: "Organization profile", icon: "explore", to: `/organizations/${id}`, external: true },
  { key: "staff", label: "Staff & permissions", icon: "network", shortLabel: "Staff", to: base + "/staff", sensitive: true },
  { key: "credentials", label: "Credential reviews", icon: "learning", shortLabel: "Reviews", to: base + "/credentials", sensitive: true },
];
const planned = [{ key: "posts", label: "Posts & content", sprint: 5 }, { key: "opportunities", label: "Opportunities", sprint: 6 }, { key: "programs", label: "Programs", sprint: 7 }, { key: "admissions", label: "Admissions", sprint: 7 }];
const context = { accountId: "owner", organization, permissions: [MANAGE, REVIEW], membership: { role: "PRIMARY_ADMIN", version: 1 }, permissionCatalog: [{ key: MANAGE, label: "Manage staff" }, { key: REVIEW, label: "Review education credentials" }], staffVersion: 1, workspace: { available, planned, campusActive: false, campusSetup: { label: "Build Campus", to: base + "/campus", status: "COMING_SOON" } } };
const profile = { version: 1, photo: null, location: {}, skills: [], interests: [] };
const reply = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } });
function mount(path = base, handler = () => reply(context)) {
  const fetch = vi.fn((url, options) => url.endsWith("/profile/me") ? reply({ profile }) : handler(url, options)); vi.stubGlobal("fetch", fetch);
  render(<AuthContext.Provider value={{ account: { id: "owner", username: "owner", person: { firstName: "Test", lastName: "Owner" } } }}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout />}>
    <Route path="/work" element={<WorkPage />} />
    <Route path="/organizations/new" element={<OrganizationRequestsPage />} />
    <Route path="/organization-workspace/:id" element={<OrganizationWorkspacePage />} />
    <Route path="/organization-workspace/:id/campus" element={<OrganizationWorkspacePage section="campus" />} />
    <Route path="/organization-workspace/:id/staff" element={<OrganizationWorkspacePage section="staff" />} />
    <Route path="/organization-workspace/:organizationId/credentials" element={<CredentialReviewsPage />} />
    <Route path="/explore" element={<p>Personal destination</p>} />
  </Route></Routes></MemoryRouter></AuthContext.Provider>);
  return { fetch, user: userEvent.setup() };
}
it("an approved organization in My Workspace opens its private administrator workspace instead of the public profile", async () => {
  const f = mount("/work", url => url.includes("/my-workspace") ? reply({ tab: "approved", search: "", counts: { approved: 1, pending: 0, invitations: 0, history: 0 }, items: [{ ...organization, role: "PRIMARY_ADMIN" }] }) : reply(context));
  const entry = await screen.findByRole("link", { name: "Manage" }); expect(entry.getAttribute("href")).toBe(base);
  await f.user.click(entry); expect(screen.queryByRole("heading", { name: "Switch account" })).toBeNull(); await screen.findByRole("heading", { name: organization.name, level: 1 });
  await screen.findByRole("navigation", { name: "Organization tools" });
  expect(document.querySelector(".bw-design-personal").textContent).toContain(organization.name);
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/staff"))).toBe(false);
});
it("desktop and mobile organization navigation expose scoped operational tools without personal destinations", async () => {
  mount(); await screen.findByRole("heading", { name: organization.name, level: 1 });
  const nav = await screen.findByRole("navigation", { name: "Organization tools" });
  expect(within(nav).getByRole("link", { name: "Staff & permissions" }).getAttribute("href")).toBe(base + "/staff");
  expect(within(nav).queryByRole("link", { name: "Explore" })).toBeNull();
  const mobile = screen.getByRole("navigation", { name: "Mobile organization navigation" });
  expect(within(mobile).getByRole("link", { name: "Reviews" }).getAttribute("href")).toBe(base + "/credentials");
  expect(within(mobile).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
  expect(within(mobile).queryByRole("link", { name: "Post" })).toBeNull();
});
it("planned tools explain delivery status without fake forms or action links and Campus stays inactive", async () => {
  mount(); await screen.findByRole("heading", { name: "Planned workspace tools" });
  const item = screen.getByRole("heading", { name: "Posts & content" }).closest("article");
  expect(within(item).getByText("Planned")).toBeTruthy(); expect(within(item).queryByRole("link")).toBeNull(); expect(within(item).queryByRole("button")).toBeNull();
  expect(screen.queryByRole("button", { name: /activate campus/i })).toBeNull(); expect(screen.queryByRole("link", { name: /billing/i })).toBeNull();
});
it("staff management is a dedicated scoped destination and revoked permission clears private rows and navigation", async () => {
  let revoked = false;
  const f = mount(base + "/staff", url => url.endsWith("/staff") ? reply({ staffVersion: 1, members: [{ id: "member", username: "private_staff", role: "STAFF", version: 1, enabled: true, permissions: [] }], invitations: [] }) : reply(revoked ? { ...context, permissions: [], workspace: { available: available.slice(0, 2), planned: [], campusActive: false } } : context));
  await screen.findByText("@private_staff"); revoked = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert"); expect(screen.queryByText("@private_staff")).toBeNull();
  const nav = screen.getByRole("navigation", { name: "Organization tools" }); expect(within(nav).queryByRole("link", { name: "Staff & permissions" })).toBeNull(); expect(f.fetch).toHaveBeenCalled();
});
it("a direct issuer review URL keeps the organization tools available and links back to staff management", async () => {
  const f = mount(base + "/credentials", url => url.includes("/credential-reviews") ? reply({ reviews: [], nextCursor: null, organization, workspace: context.workspace }) : url.endsWith("/staff") ? reply({ staffVersion: 1, members: [], invitations: [] }) : reply(context));
  await screen.findByRole("heading", { name: /Verified Test School — credential reviews/ });
  const nav = screen.getByRole("navigation", { name: "Organization tools" }); await f.user.click(within(nav).getByRole("link", { name: "Staff & permissions" }));
  await screen.findByLabelText("BrightWay username"); expect(document.querySelector(".bw-design-personal").textContent).toContain(organization.name);
});
it("denied organization membership cannot leave another organization's tools or name in the workspace", async () => {
  mount(base, () => reply("Organization membership required", 403)); await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: organization.name })).toBeNull();
  expect(within(screen.getByRole("navigation", { name: "Organization tools" })).queryByRole("link")).toBeNull();
});
it("a publishing-only member sees their available scope and no staff, review or school-management tools", async () => {
  mount(base, () => reply({ ...context, membership: { role: "STAFF" }, permissions: ["organization.posts.publish"], workspace: { available: available.slice(0, 2), planned: planned.slice(0, 1), campusActive: false } }));
  await screen.findByRole("heading", { name: organization.name, level: 1 });
  const nav = screen.getByRole("navigation", { name: "Organization tools" }); expect(within(nav).queryByRole("link", { name: "Staff & permissions" })).toBeNull(); expect(within(nav).queryByRole("link", { name: "Credential reviews" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Admissions" })).toBeNull();
  const mobile = screen.getByRole("navigation", { name: "Mobile organization navigation" }); expect(within(mobile).getAllByRole("link")).toHaveLength(2);
});
it("a direct staff URL never exposes staff controls to a member without staff-management permission", async () => {
  const limited = { ...context, membership: { role: "STAFF" }, permissions: ["organization.posts.publish"], workspace: { available: available.slice(0, 2), planned: planned.slice(0, 1), campusActive: false } };
  const f = mount(base + "/staff", url => url.endsWith("/staff") ? reply({ staffVersion: 1, members: [{ id: "private", username: "private_staff" }], invitations: [] }) : reply(limited));
  await screen.findByRole("heading", { name: "This tool is not available to your role" });
  expect(screen.queryByText("@private_staff")).toBeNull();
  expect(screen.queryByLabelText("BrightWay username")).toBeNull();
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/staff"))).toBe(false);
  expect(screen.getByRole("link", { name: "Return to your workspace" }).getAttribute("href")).toBe(base);
});

it("direct organization entry shows workspace loading rather than an account picker", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  mount(base, url => url.endsWith(base) ? pending : reply({}));
  await screen.findByRole("heading", { name: "Organization workspace", level: 1 });
  expect(screen.queryByRole("heading", { name: "Switch account" })).toBeNull();
  await act(async () => release(reply(context)));
  await screen.findByRole("heading", { name: organization.name, level: 1 });
});

it("Build Campus is a separate sidebar block and opens an informational overview without activation", async () => {
  const f = mount(); await screen.findByRole("heading", { name: organization.name, level: 1 });
  const sidebar = screen.getByRole("complementary", { name: "Organization navigation" });
  const entry = within(sidebar).getByRole("link", { name: "Build Campus" });
  expect(within(screen.getByRole("navigation", { name: "Organization tools" })).queryByRole("link", { name: "Build Campus" })).toBeNull();
  expect(entry.getAttribute("href")).toBe(base + "/campus"); await f.user.click(entry);
  await screen.findByRole("heading", { name: "Build Campus" });
  expect(screen.getByText("Campus setup is not available yet.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /activate|pay|submit/i })).toBeNull();
  expect(f.fetch.mock.calls.some(([, options]) => options?.method && options.method !== "GET")).toBe(false);
});
it("Campus overview rejects ordinary members and non-training company administrators", async () => {
  const limited = { ...context, organization: { ...organization, type: "COMPANY", offersTraining: false }, workspace: { available: available.slice(0, 2), planned: [], campusActive: false, campusSetup: null } };
  mount(base + "/campus", () => reply(limited));
  await screen.findByRole("heading", { name: "This tool is not available to your role" });
  expect(screen.queryByRole("heading", { name: "Build Campus" })).toBeNull();
  expect(within(screen.getByRole("complementary", { name: "Organization navigation" })).queryByRole("link", { name: "Build Campus" })).toBeNull();
});
it("ordinary school staff cannot open the Campus administrator overview through a copied URL", async () => {
  mount(base + "/campus", () => reply({ ...context, membership: { role: "STAFF" }, workspace: { available: available.slice(0, 2), planned: [], campusActive: false, campusSetup: null } }));
  await screen.findByRole("heading", { name: "This tool is not available to your role" });
  expect(screen.queryByRole("heading", { name: "Build Campus" })).toBeNull();
  expect(within(screen.getByRole("complementary", { name: "Organization navigation" })).queryByRole("link", { name: "Build Campus" })).toBeNull();
});
