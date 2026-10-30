import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../auth/auth-context";
import OrganizationSetupGate from "../components/organizations/OrganizationSetupGate";
import OrganizationProfile from "../components/organizations/OrganizationProfile";
import VerificationBadge from "../components/VerificationBadge";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59";
const organization = { id, name: "BrightWay Test School", type: "SCHOOL", offersTraining: true };
const initial = { organization, required: true, canEdit: true, role: "PRIMARY_ADMIN", username: null, photo: null, version: 0, nextStep: 1, phoneNumber: null, contactEmail: null, website: null };
const photo = { id: "f7b014bb-9027-40a5-ab85-59bc04793d79", url: `/api/v1/organizations/${id}/photo/f7b014bb-9027-40a5-ab85-59bc04793d79` };
const reply = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status });
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn(function () { this.setAttribute("open", ""); }) });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn(function () { this.removeAttribute("open"); }) });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test-picture"), revokeObjectURL: vi.fn() }));
});
function server(start = initial) {
  let profile = { ...start };
  return (url, options = {}) => {
    if (url.endsWith(`/organizations/${id}`)) return reply({ ...organization, ...profile, id, locations: [], verified: true });
    if (options.method === "PUT") profile = { ...profile, username: JSON.parse(options.body).username.toLowerCase(), version: profile.version + 1, nextStep: 2 };
    if (options.method === "POST") profile = { ...profile, photo, version: profile.version + 1, nextStep: 3 };
    if (options.method === "PATCH") {
      const { field, value } = JSON.parse(options.body);
      profile = { ...profile, [field]: value, nextStep: field === "phoneNumber" ? 4 : 5, required: field === "website" ? false : profile.required, version: profile.version + 1 };
    }
    return reply(profile);
  };
}
function mount(handler, path = `/organization-workspace/${id}`) {
  const fetch = vi.fn(handler); vi.stubGlobal("fetch", fetch);
  render(<AuthContext.Provider value={{ account: { id: "owner", username: "owner" } }}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/organization-workspace/:id" element={<OrganizationSetupGate><h1>Private organization Dashboard</h1></OrganizationSetupGate>} />
    <Route path="/organization-workspace/:organizationId/credentials" element={<OrganizationSetupGate><h1>Private credential queue</h1></OrganizationSetupGate>} />
    <Route path="/work" element={<h1>My Workspace</h1>} />
  </Routes></MemoryRouter></AuthContext.Provider>);
  return { fetch, user: userEvent.setup() };
}
const image = () => new File(["fixture"], "school.png", { type: "image/png" });
async function skipContacts(user) {
  await screen.findByLabelText(/Organization phone number/); await user.click(screen.getByRole("button", { name: "Skip for now" }));
  await screen.findByLabelText(/Organization email/); await user.click(screen.getByRole("button", { name: "Skip for now" }));
  await screen.findByLabelText(/Organization website/); await user.click(screen.getByRole("button", { name: "Skip and finish" }));
}
it("runs five non-dismissible steps, requires username/photo and allows all three public contacts to be skipped", async () => {
  const f = mount(server());
  const dialog = await screen.findByRole("dialog", { name: "Organization Setup" });
  expect(within(dialog).queryByRole("button", { name: "Close editor" })).toBeNull();
  expect(within(dialog).getByRole("list", { name: "Organization setup steps" }).children.length).toBe(5);
  expect(screen.queryByRole("heading", { name: "Private organization Dashboard" })).toBeNull();
  const cancel = new Event("cancel", { cancelable: true }); dialog.dispatchEvent(cancel); expect(cancel.defaultPrevented).toBe(true);
  await f.user.click(dialog); expect(screen.getByRole("dialog")).toBeTruthy();
  await f.user.type(screen.getByLabelText("Organization username"), "NEW_SCHOOL"); await f.user.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByLabelText("Organization profile picture"); expect(screen.getByRole("button", { name: "Save photo and continue" }).disabled).toBe(true);
  await f.user.upload(screen.getByLabelText("Organization profile picture"), image()); await f.user.click(screen.getByRole("button", { name: "Save photo and continue" }));
  await screen.findByLabelText(/Organization phone number/); expect(screen.queryByRole("heading", { name: "Private organization Dashboard" })).toBeNull();
  await skipContacts(f.user); await screen.findByRole("heading", { name: "Private organization Dashboard" }); expect(screen.queryByRole("dialog")).toBeNull();
  const save = f.fetch.mock.calls.find(([, o]) => o?.method === "PUT"); expect(JSON.parse(save[1].body)).toEqual({ username: "new_school", expectedVersion: 0 }); expect(save[1].credentials).toBe("include");
  const upload = f.fetch.mock.calls.find(([, o]) => o?.method === "POST"); expect(upload[1].headers["X-Organization-Profile-Version"]).toBe("1"); expect(upload[1].body.name).toBe("school.png");
  const contacts = f.fetch.mock.calls.filter(([, o]) => o?.method === "PATCH").map(([, o]) => JSON.parse(o.body));
  expect(contacts).toEqual([{ field: "phoneNumber", value: null, expectedVersion: 2 }, { field: "contactEmail", value: null, expectedVersion: 3 }, { field: "website", value: null, expectedVersion: 4 }]);
});
it("resumes saved setup at the current optional step and blocks copied credential URLs", async () => {
  mount(server({ ...initial, username: "saved_school", photo, version: 3, nextStep: 4, phoneNumber: "+231771234567" }), `/organization-workspace/${id}/credentials`);
  await screen.findByLabelText(/Organization email/); expect(screen.queryByLabelText("Organization username")).toBeNull(); expect(screen.queryByRole("heading", { name: "Private credential queue" })).toBeNull();
});
it("keeps the selected photo after storage failure and requires a saved-state reload before retrying", async () => {
  let fail = true; const handle = server({ ...initial, username: "saved_school", version: 1, nextStep: 2 });
  const f = mount((url, options = {}) => options.method === "POST" && fail ? reply("Storage is unavailable.", 503) : handle(url, options));
  await f.user.upload(await screen.findByLabelText("Organization profile picture"), image()); await f.user.click(screen.getByRole("button", { name: "Save photo and continue" })); await screen.findByRole("alert");
  expect(screen.getByText("school.png")).toBeTruthy(); expect(screen.getByRole("button", { name: "Save photo and continue" }).disabled).toBe(true);
  await f.user.click(screen.getByRole("button", { name: "Reload saved profile" })); fail = false; await f.user.click(screen.getByRole("button", { name: "Save photo and continue" }));
  await skipContacts(f.user); await screen.findByRole("heading", { name: "Private organization Dashboard" });
  expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST").length).toBe(2);
});
it("cannot submit twice or go back while picture storage is pending, and photo alone never unlocks the workspace", async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = mount((_url, o = {}) => o.method === "POST" ? pending : reply({ ...initial, username: "saved_school", version: 1, nextStep: 2 }));
  await f.user.upload(await screen.findByLabelText("Organization profile picture"), image()); await f.user.dblClick(screen.getByRole("button", { name: "Save photo and continue" }));
  expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(true); expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST").length).toBe(1);
  await act(async () => resolve(reply({ ...initial, username: "saved_school", photo, version: 2, nextStep: 3 })));
  await screen.findByLabelText(/Organization phone number/); expect(screen.queryByRole("heading", { name: "Private organization Dashboard" })).toBeNull();
});
it("saves optional phone, email and website without sending personal-account ownership or verification fields", async () => {
  const f = mount(server({ ...initial, username: "saved_school", photo, version: 2, nextStep: 3 }));
  await f.user.type(await screen.findByLabelText(/Organization phone number/), "+231771234567"); await f.user.click(screen.getByRole("button", { name: "Save and continue" }));
  await f.user.type(await screen.findByLabelText(/Organization email/), "office@example.com"); await f.user.click(screen.getByRole("button", { name: "Save and continue" }));
  await f.user.type(await screen.findByLabelText(/Organization website/), "https://example.com/"); await f.user.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByRole("heading", { name: "Private organization Dashboard" });
  expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "PATCH").map(([, o]) => JSON.parse(o.body))).toEqual([{ field: "phoneNumber", value: "+231771234567", expectedVersion: 2 }, { field: "contactEmail", value: "office@example.com", expectedVersion: 3 }, { field: "website", value: "https://example.com/", expectedVersion: 4 }]);
});
it("skipping retains a saved optional value while clearing and continuing explicitly removes it", async () => {
  const f = mount(server({ ...initial, username: "saved_school", photo, version: 2, nextStep: 3, phoneNumber: "+231771234567", contactEmail: "old@example.com" }));
  await f.user.clear(await screen.findByLabelText(/Organization phone number/)); await f.user.type(screen.getByLabelText(/Organization phone number/), "bad draft"); await f.user.click(screen.getByRole("button", { name: "Skip for now" }));
  await f.user.clear(await screen.findByLabelText(/Organization email/)); await f.user.click(screen.getByRole("button", { name: "Save and continue" }));
  const requests = f.fetch.mock.calls.filter(([, o]) => o?.method === "PATCH").map(([, o]) => JSON.parse(o.body)); expect(requests[0].value).toBe("+231771234567"); expect(requests[1].value).toBeNull();
});
it("staff cannot complete setup without profile permission", async () => {
  const f = mount(() => reply({ ...initial, canEdit: false, role: "STAFF" }));
  await screen.findByRole("heading", { name: "Organization setup pending" }); expect(screen.queryByRole("dialog")).toBeNull();
  await f.user.click(screen.getByRole("link", { name: "Back to My Workspace" })); await screen.findByRole("heading", { name: "My Workspace" });
});
it("rejects a profile response bound to another organization", async () => {
  mount(() => reply({ ...initial, required: false, organization: { ...organization, id: "foreign" } })); await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "Private organization Dashboard" })).toBeNull();
});
it("Edit Profile updates contacts through the same five steps and displays the saved public values", async () => {
  vi.stubGlobal("fetch", vi.fn(server({ ...initial, required: false, username: "old_school", photo, version: 5, nextStep: 5 })));
  render(<OrganizationProfile organization={organization} role="PRIMARY_ADMIN" canEdit />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit Profile" })); await user.clear(await screen.findByLabelText("Organization username")); await user.type(screen.getByLabelText("Organization username"), "updated_school");
  await user.click(screen.getByRole("button", { name: "Save and continue" })); await user.click(await screen.findByRole("button", { name: "Save photo and continue" }));
  await user.type(await screen.findByLabelText(/Organization phone number/), "+231771234567"); await user.click(screen.getByRole("button", { name: "Save and continue" }));
  await user.type(await screen.findByLabelText(/Organization email/), "office@example.com"); await user.click(screen.getByRole("button", { name: "Save and continue" }));
  await user.type(await screen.findByLabelText(/Organization website/), "https://example.com/"); await user.click(screen.getByRole("button", { name: "Save Profile" }));
  await screen.findByText("@updated_school"); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByRole("link", { name: "office@example.com" }).getAttribute("href")).toBe("mailto:office@example.com");
  expect(screen.getByRole("link", { name: "https://example.com/" }).getAttribute("rel")).toBe("noopener noreferrer");
});
it("uses the same blue verification artwork for organizations and individuals with distinct labels", () => {
  render(<><VerificationBadge /><VerificationBadge kind="organization" /></>);
  const identity = screen.getByRole("img", { name: "Verified identity" }), org = screen.getByRole("img", { name: "Verified organization" });
  expect(identity.querySelector("svg").innerHTML).toBe(org.querySelector("svg").innerHTML); expect(org.getAttribute("title")).toBe("Organization verified by BrightWay");
});
it("closing an optional editor refreshes changes already saved on an earlier step", async () => {
  vi.stubGlobal("fetch", vi.fn(server({ ...initial, required: false, username: "old_school", photo, version: 5, nextStep: 5 })));
  render(<OrganizationProfile organization={organization} role="PRIMARY_ADMIN" canEdit />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit Profile" })); await user.clear(await screen.findByLabelText("Organization username")); await user.type(screen.getByLabelText("Organization username"), "saved_school");
  await user.click(screen.getByRole("button", { name: "Save and continue" })); await screen.findByLabelText("Organization profile picture");
  await user.click(screen.getByRole("button", { name: "Close editor" })); await screen.findByText("@saved_school"); expect(screen.queryByRole("dialog")).toBeNull();
});
