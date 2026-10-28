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
function mount({ path = "/work", requests = [request], organizations = [], custom, hasWork = true } = {}) {
  const fetchMock = vi.fn((url, options) => {
    const result = custom?.(url, options); if (result !== undefined) return result;
    if (url.endsWith("/profile/me")) return reply({ profile: { version: 1, location: {}, photo: null, interests: [], skills: [] } });
    if (url.endsWith("/work/access")) return reply({ hasWork });
    if (url.endsWith("/organization-requests")) return reply({ requests });
    if (url.endsWith("/organization-workspace")) return reply({ organizations, invitations: [] });
    if (url.endsWith(id)) return reply(request);
    return reply({});
  }); vi.stubGlobal("fetch", fetchMock);
  const tree = actor => <AuthContext.Provider value={{ account: { id: actor, username: actor, person: { firstName: "Synthetic", lastName: "User" } } }}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout />}><Route path="/work" element={<WorkPage />} /><Route path="/work/requests/:id/edit" element={<OrganizationRequestsPage />} /><Route path="/organizations/new" element={<OrganizationRequestsPage />} /><Route path="/explore" element={<p>Explore destination</p>} /><Route path="/organization-workspace/:id" element={<p>Scoped organization workspace</p>} /></Route></Routes></MemoryRouter></AuthContext.Provider>;
  const view = render(tree("owner")); return { fetchMock, user: userEvent.setup(), switchAccount: () => view.rerender(tree("other")) };
}
it("Work appears immediately after Learning only for persisted organization participation", async () => {
  mount(); const nav = screen.getByRole("navigation", { name: "Main navigation" });
  const link = await within(nav).findByRole("link", { name: "Work" }); expect(link.previousElementSibling.textContent).toContain("Learning");
  expect(within(screen.getByRole("navigation", { name: "Work tabs" })).getByRole("link", { name: "My Workspace" }).getAttribute("href")).toBe("/work");
});
it("first use keeps the original interest entry and submission reveals Work plus confirmation without another form", async () => {
  let applied = false;
  const f = mount({ path: "/organizations/new", requests: [], hasWork: false, custom: (url, options) => {
    if (url.endsWith("/work/access")) return reply({ hasWork: applied });
    if (options?.method === "POST") { applied = true; return reply({ ...request, status: "SUBMITTED", version: 1 }); }
  } });
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryByRole("link", { name: "Work" })).toBeNull();
  await f.user.type(await screen.findByLabelText("Organization name"), request.name); await f.user.type(screen.getByLabelText("Your representative role"), "Principal"); await f.user.selectOptions(screen.getByLabelText("Country of operation"), "GH"); await f.user.type(screen.getByLabelText("City / locality"), "Accra"); await f.user.type(screen.getByLabelText("Operating address"), "Synthetic street");
  fireEvent.submit(screen.getByLabelText("Organization name").closest("form"));
  await screen.findByText(/Your interest to register.*Bright Future School.*is submitted for review in 72 hours/);
  expect(screen.queryByLabelText("Organization name")).toBeNull(); expect(screen.getByRole("link", { name: "View Progress" }).getAttribute("href")).toBe(`/work#request-${id}`);
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Work" })).toBeTruthy();
  await f.user.click(screen.getByRole("button", { name: "Create another organization" })); expect((await screen.findByLabelText("Organization name")).value).toBe("");
});
it("My Workspace combines pending requests and memberships, deduplicates approved requests and provides real review-stage progress", async () => {
  mount({ requests: [request, { ...request, id: "approved", organizationId: org, status: "APPROVED" }], organizations: [{ id: org, name: "Approved Employer", role: "STAFF" }] });
  const progress = await screen.findByRole("progressbar", { name: `${request.name} review progress` }); expect(progress.value).toBe(75);
  expect(screen.getByRole("heading", { name: "Approved Employer" })).toBeTruthy(); expect(screen.getByText("Staff")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Manage" })).toHaveLength(1); expect(screen.getByRole("link", { name: "Manage" }).getAttribute("href")).toBe(`/organization-workspace/${org}`);
  expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(`/work/requests/${id}/edit`);
});
it("Abort requires confirmation, cannot double-submit, and replaces progress with withdrawn status", async () => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  const f = mount({ custom: (url, options) => options?.method === "POST" ? pending : undefined });
  await f.user.click(await screen.findByRole("button", { name: "Abort" }));
  const dialog = screen.getByRole("dialog"); expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Keep request" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Abort request" })); fireEvent.click(within(dialog).getByRole("button", { name: "Withdrawing…" }));
  expect(f.fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  await act(async () => resolve(reply({ ...request, status: "ABORTED", version: 4 })));
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
  mount({ custom: url => denied && (url.endsWith("/organization-workspace") || url.endsWith("/organization-requests")) ? reply("Sign in again", 401) : undefined });
  await screen.findByRole("heading", { name: request.name }); denied = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: request.name })).toBeNull();
});
it("a delayed pre-submission Work lookup cannot hide navigation after the confirmed first interest", async () => {
  let release; const delayed = new Promise(resolve => { release = resolve; });
  const f = mount({ path: "/organizations/new", hasWork: false, custom: (url, options) => url.endsWith("/work/access") ? delayed : options?.method === "POST" ? reply(request) : undefined });
  await f.user.type(await screen.findByLabelText("Organization name"), request.name); await f.user.type(screen.getByLabelText("Your representative role"), "Principal"); await f.user.selectOptions(screen.getByLabelText("Country of operation"), "GH"); await f.user.type(screen.getByLabelText("City / locality"), "Accra"); await f.user.type(screen.getByLabelText("Operating address"), "Synthetic street");
  await f.user.click(screen.getByRole("button", { name: "Submit organization request" })); await screen.findByRole("heading", { name: "Interest submitted" });
  await act(async () => release(reply({ hasWork: false })));
  expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Work" })).toBeTruthy();
});
