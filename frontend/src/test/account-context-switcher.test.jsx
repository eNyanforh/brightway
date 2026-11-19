import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AuthContext } from "../auth/auth-context";
import HeaderProfileMenu from "../components/layout/HeaderProfileMenu";
import { staffApi } from "../api/organization-staff";

vi.mock("../api/organization-staff", () => ({
  staffApi: { directory: vi.fn() },
}));
const organizationId = "11111111-1111-4111-8111-111111111111";
const account = { id: "member", username: "member", person: { firstName: "Test", lastName: "Member" } };

function Route({ actingOrganization = null, unsaved = false }) {
  const location = useLocation();
  return <><HeaderProfileMenu hasWork profileBusy={false} unsaved={unsaved}
    actingOrganization={actingOrganization} />
    <output data-testid="route">{location.pathname + location.search}</output></>;
}
function mount(path = "/explore", actingOrganization = null, unsaved = false) {
  render(<AuthContext.Provider value={{ account, logout: vi.fn() }}>
    <MemoryRouter initialEntries={[path]}><Route actingOrganization={actingOrganization} unsaved={unsaved} /></MemoryRouter>
  </AuthContext.Provider>);
  return userEvent.setup();
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

it("shows only approved organizations and personal identity in account shortcuts", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab", photoId: "logo-1" }] });
  const user = mount();
  const shortcuts = screen.getByRole("navigation", { name: "Account shortcuts" });
  await waitFor(() => expect(within(shortcuts).getAllByRole("link")).toHaveLength(2));
  expect(within(shortcuts).getAllByRole("link").map(link => link.getAttribute("aria-label")))
    .toEqual(["Open personal account", "Open Community Lab organization workspace"]);
  expect(within(shortcuts).queryByRole("link", { name: /campus/i })).toBeNull();
  expect(staffApi.directory).toHaveBeenCalledWith(expect.any(AbortSignal), { tab: "approved" });
  await user.click(within(shortcuts).getByRole("link", { name: "Open Community Lab organization workspace" }));
  expect(screen.getByTestId("route").textContent).toBe(`/organization-workspace/${organizationId}`);
  await user.click(within(shortcuts).getByRole("link", { name: "Open personal account" }));
  expect(screen.getByTestId("route").textContent).toBe("/explore");
});

it("keeps an authorized organization first while viewing its workspace", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab" }] });
  const user = mount(`/organization-workspace/${organizationId}`, { id: organizationId, name: "Community Lab" });
  const shortcuts = screen.getByRole("navigation", { name: "Account shortcuts" });
  await waitFor(() => expect(within(shortcuts).getAllByRole("link")[0].getAttribute("aria-current")).toBe("true"));
  expect(within(shortcuts).getAllByRole("link")[0].getAttribute("aria-label")).toBe("Open Community Lab organization workspace");
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  expect(screen.getByRole("navigation", { name: "Switch account" }).querySelector('[aria-current="page"]').textContent).toContain("Community Lab");
});

it("does not show stale workspaces after a directory error", async () => {
  staffApi.directory.mockRejectedValue(new Error("Unauthorized"));
  const user = mount();
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await screen.findByText("No active organization memberships.");
  expect(screen.getByRole("navigation", { name: "Account shortcuts" }).querySelectorAll("a")).toHaveLength(1);
});

it("shows all approved organizations, beyond three avatars", async () => {
  staffApi.directory.mockResolvedValue({ items: Array.from({ length: 6 }, (_, i) => ({ id: `org-${i}`, name: `School ${i}` })) });
  const user = mount();
  const shortcuts = screen.getByRole("navigation", { name: "Account shortcuts" });
  await waitFor(() => expect(within(shortcuts).getAllByRole("link")).toHaveLength(7));
  await user.click(within(shortcuts).getByRole("link", { name: "Open School 5 organization workspace" }));
  expect(screen.getByTestId("route").textContent).toBe("/organization-workspace/org-5");
});

it("guards unsaved edits when switching to an organization", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab" }] });
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  const user = mount("/profile", null, true);
  const link = await screen.findByRole("link", { name: "Open Community Lab organization workspace" });
  await user.click(link);
  expect(screen.getByTestId("route").textContent).toBe("/profile");
  expect(confirm).toHaveBeenCalledOnce();
  confirm.mockReturnValue(true);
  await user.click(link);
  expect(screen.getByTestId("route").textContent).toBe(`/organization-workspace/${organizationId}`);
});
