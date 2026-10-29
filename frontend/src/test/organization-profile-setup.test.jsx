import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../auth/auth-context";
import OrganizationSetupGate from "../components/organizations/OrganizationSetupGate";
import OrganizationProfile from "../components/organizations/OrganizationProfile";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59";
const organization = { id, name: "BrightWay Test School", type: "SCHOOL", offersTraining: true };
const initial = { organization, required: true, canEdit: true, role: "PRIMARY_ADMIN", username: null, photo: null, version: 0 };
const photo = { id: "f7b014bb-9027-40a5-ab85-59bc04793d79", url: `/api/v1/organizations/${id}/photo/f7b014bb-9027-40a5-ab85-59bc04793d79` };
const reply = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status });
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn(function () { this.setAttribute("open", ""); }) });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn(function () { this.removeAttribute("open"); }) });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test-picture"), revokeObjectURL: vi.fn() }));
});
function mount(handler, path = `/organization-workspace/${id}`) {
  const fetch = vi.fn(handler); vi.stubGlobal("fetch", fetch);
  render(<AuthContext.Provider value={{ account: { id: "owner", username: "owner" } }}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/organization-workspace/:id" element={<OrganizationSetupGate><h1>Private organization Dashboard</h1></OrganizationSetupGate>} />
    <Route path="/organization-workspace/:organizationId/credentials" element={<OrganizationSetupGate><h1>Private credential queue</h1></OrganizationSetupGate>} />
    <Route path="/work" element={<h1>My Workspace</h1>} />
  </Routes></MemoryRouter></AuthContext.Provider>);
  return { fetch, user: userEvent.setup() };
}
it("opens non-dismissible username then picture setup and reveals the workspace only after the server confirms completion", async () => {
  let profile = initial;
  const f = mount((_url, options = {}) => {
    if (options.method === "PUT") profile = { ...initial, username: "new_school", version: 1 };
    if (options.method === "POST") profile = { ...profile, required: false, photo, version: 2 };
    return reply(profile);
  });
  const dialog = await screen.findByRole("dialog", { name: "Set up your organization" });
  expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Private organization Dashboard" })).toBeNull();
  const cancel = new Event("cancel", { cancelable: true }); dialog.dispatchEvent(cancel); expect(cancel.defaultPrevented).toBe(true);
  await f.user.click(dialog); expect(screen.getByRole("dialog")).toBeTruthy();
  await f.user.type(screen.getByLabelText("Organization username"), "NEW_SCHOOL");
  await f.user.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByLabelText("Organization profile picture");
  const save = f.fetch.mock.calls.find(([, options]) => options?.method === "PUT"); expect(JSON.parse(save[1].body)).toEqual({ username: "new_school", expectedVersion: 0 }); expect(save[1].credentials).toBe("include");
  const finish = screen.getByRole("button", { name: "Finish setup" }); expect(finish.disabled).toBe(true);
  await f.user.upload(screen.getByLabelText("Organization profile picture"), new File(["fixture"], "school.png", { type: "image/png" }));
  await f.user.click(finish); await screen.findByRole("heading", { name: "Private organization Dashboard" });
  expect(screen.queryByRole("dialog")).toBeNull();
  const upload = f.fetch.mock.calls.find(([, options]) => options?.method === "POST"); expect(upload[1].headers["X-Organization-Profile-Version"]).toBe("1"); expect(upload[1].body.name).toBe("school.png");
});
it("resumes at the picture step from saved username and blocks copied credential URLs until setup completes", async () => {
  mount(() => reply({ ...initial, username: "saved_school", version: 1 }), `/organization-workspace/${id}/credentials`);
  await screen.findByLabelText("Organization profile picture"); expect(screen.queryByLabelText("Organization username")).toBeNull(); expect(screen.queryByRole("heading", { name: "Private credential queue" })).toBeNull();
});
it("retains a selected file after upload failure and requires a saved-state reload before retrying an uncertain request", async () => {
  let fail = true;
  const f = mount((_url, options = {}) => options.method === "POST" ? fail ? reply("Storage is unavailable.", 503) : reply({ ...initial, required: false, username: "saved_school", photo, version: 2 }) : reply({ ...initial, username: "saved_school", version: 1 }));
  await f.user.upload(await screen.findByLabelText("Organization profile picture"), new File(["fixture"], "retry.png", { type: "image/png" }));
  await f.user.click(screen.getByRole("button", { name: "Finish setup" })); await screen.findByRole("alert"); expect(screen.getByText("retry.png")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Finish setup" }).disabled).toBe(true);
  await f.user.click(screen.getByRole("button", { name: "Reload saved profile" }));
  fail = false; await f.user.click(screen.getByRole("button", { name: "Finish setup" })); await screen.findByRole("heading", { name: "Private organization Dashboard" });
  expect(f.fetch.mock.calls.filter(([, options]) => options?.method === "POST").length).toBe(2);
});
it("cannot submit twice, go back or cancel while the picture save is pending", async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = mount((_url, options = {}) => options.method === "POST" ? pending : reply({ ...initial, username: "saved_school", version: 1 }));
  await f.user.upload(await screen.findByLabelText("Organization profile picture"), new File(["fixture"], "school.png", { type: "image/png" }));
  await f.user.dblClick(screen.getByRole("button", { name: "Finish setup" }));
  expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(true);
  expect(f.fetch.mock.calls.filter(([, options]) => options?.method === "POST").length).toBe(1);
  await act(async () => resolve(reply({ ...initial, username: "saved_school", photo, required: false, version: 2 })));
  await screen.findByRole("heading", { name: "Private organization Dashboard" });
});
it("staff cannot complete setup without profile permission and a foreign response cannot unlock a workspace", async () => {
  const f = mount(() => reply({ ...initial, canEdit: false, role: "STAFF" }));
  await screen.findByRole("heading", { name: "Organization setup pending" }); expect(screen.queryByRole("dialog")).toBeNull();
  await f.user.click(screen.getByRole("link", { name: "Back to My Workspace" })); await screen.findByRole("heading", { name: "My Workspace" });
});
it("rejects a profile response bound to another organization", async () => {
  mount(() => reply({ ...initial, required: false, organization: { ...organization, id: "foreign" } }));
  await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "Private organization Dashboard" })).toBeNull();
});
it("Edit Profile opens the real editor for an authorized member and reloads the saved public picture/username", async () => {
  let username = "old_school";
  const fetch = vi.fn((url, options = {}) => {
    if (url.endsWith(`/organizations/${id}`)) return reply({ ...organization, username, photo, locations: [], verified: true });
    if (options.method === "PUT") username = JSON.parse(options.body).username;
    return reply({ ...initial, required: false, username, photo, version: 2 });
  }); vi.stubGlobal("fetch", fetch);
  render(<OrganizationProfile organization={organization} role="PRIMARY_ADMIN" canEdit />);
  const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Edit Profile" }));
  await user.clear(await screen.findByLabelText("Organization username")); await user.type(screen.getByLabelText("Organization username"), "updated_school");
  await user.click(screen.getByRole("button", { name: "Save and continue" })); await user.click(await screen.findByRole("button", { name: "Save Profile" }));
  await screen.findByText("@updated_school"); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByRole("img", { name: `${organization.name} profile picture` })).toBeTruthy();
});
