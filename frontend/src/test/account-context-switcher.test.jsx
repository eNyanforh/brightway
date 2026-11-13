import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AuthContext } from "../auth/auth-context";
import HeaderProfileMenu from "../components/layout/HeaderProfileMenu";
import { staffApi } from "../api/organization-staff";
import { schoolApi } from "../api/grade-school";

vi.mock("../api/organization-staff", () => ({
  staffApi: { directory: vi.fn() },
}));
vi.mock("../api/grade-school", () => ({
  schoolApi: { myCampus: vi.fn() },
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const campusId = "22222222-2222-4222-8222-222222222222";
const account = { id: "member", username: "member", person: { firstName: "Test", lastName: "Member" } };
function Route({ actingOrganization = null }) {
  const location = useLocation();
  return <><HeaderProfileMenu hasWork={true} profileBusy={false} unsaved={false}
    actingOrganization={actingOrganization} />
    <output data-testid="route">{location.pathname + location.search}</output></>;
}
function mount(path = "/explore", actingOrganization = null) {
  render(<AuthContext.Provider value={{ account, logout: vi.fn() }}>
    <MemoryRouter initialEntries={[path]}><Route actingOrganization={actingOrganization} /></MemoryRouter>
  </AuthContext.Provider>);
  return userEvent.setup();
}
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("uses only active approved memberships and enrolled schools for the avatar facepile", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab", photoId: "logo-1" }] });
  schoolApi.myCampus.mockResolvedValue({ items: [
    { id: "registration-1", campusId, schoolName: "Learning Academy", status: "ACTIVE", studentStatus: "ACTIVE", available: true },
    { id: "registration-2", campusId, schoolName: "Learning Academy", status: "ACTIVE", studentStatus: "ACTIVE", available: true },
    { id: "registration-3", campusId: "inactive", schoolName: "Former School", status: "COMPLETED", studentStatus: "ACTIVE", available: true },
    { id: "registration-4", campusId: "waiting", schoolName: "Waiting School", status: "PRE_REGISTERED", studentStatus: "ACTIVE", available: true },
  ] });
  const user = mount();
  await waitFor(() => expect(document.querySelectorAll(".bw-context-facepile .bw-context-avatar")).toHaveLength(2));
  const shortcuts = screen.getByRole("navigation", { name: "Account shortcuts" });
  const links = within(shortcuts).getAllByRole("link");
  expect(links).toHaveLength(3);
  expect(links.map(link => link.getAttribute("aria-label"))).toEqual([
    "Open personal account", "Open Community Lab organization workspace", "Open Learning Academy school campus",
  ]);
  expect(links[0]).toHaveAttribute("aria-current", "true");
  expect(links[1]).not.toHaveAttribute("aria-current");
  expect(links[0].style.zIndex).toBe("3");
  expect(links[1].style.zIndex).toBe("2");
  expect(staffApi.directory).toHaveBeenCalledWith(expect.any(AbortSignal), { tab: "approved" });
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  const menu = within(screen.getByRole("navigation", { name: "Switch account" }));
  expect(menu.queryByText("Former School")).toBeNull();
  expect(menu.queryByText("Waiting School")).toBeNull();
  await user.click(within(shortcuts).getByRole("link", { name: "Open Learning Academy school campus" }));
  expect(screen.getByTestId("route").textContent).toBe(`/learning?view=campus&campus=${campusId}`);
});

it("opens an authorized organization workspace and returns to personal context", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab", type: "COMPANY" }] });
  schoolApi.myCampus.mockResolvedValue({ items: [] });
  const user = mount();
  await user.click(await screen.findByRole("link", { name: "Open Community Lab organization workspace" }));
  expect(screen.getByTestId("route").textContent).toBe(`/organization-workspace/${organizationId}`);
  await user.click(screen.getByRole("link", { name: "Open personal account" }));
  expect(screen.getByTestId("route").textContent).toBe("/explore");
});

it("does not expose stale context shortcuts after an account-context read failure", async () => {
  staffApi.directory.mockRejectedValue(new Error("Unauthorized"));
  schoolApi.myCampus.mockRejectedValue(new Error("Unauthorized"));
  const user = mount();
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await screen.findByText("No active organization memberships or school enrollments.");
  expect(document.querySelectorAll(".bw-context-facepile .bw-context-avatar")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Open personal account" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Community Lab/ })).toBeNull();
});

it("makes the authorized organization primary and moves the personal avatar into the equal-size side stack", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab" }] });
  schoolApi.myCampus.mockResolvedValue({ items: [] });
  const user = mount(`/organization-workspace/${organizationId}`,
    { id: organizationId, name: "Community Lab" });
  const shortcuts = screen.getByRole("navigation", { name: "Account shortcuts" });
  await waitFor(() => expect(within(shortcuts).getAllByRole("link")[0]).toHaveAttribute("aria-current", "true"));
  expect(within(shortcuts).getAllByRole("link")[0]).toHaveAttribute("aria-label", "Open Community Lab organization workspace");
  expect(within(shortcuts).getAllByRole("link")[1]).toHaveAttribute("aria-label", "Open personal account");
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await waitFor(() => expect(screen.getByRole("navigation", { name: "Switch account" })
    .querySelector('[aria-current="page"]').textContent).toContain("Community Lab"));
});

it("makes the selected active campus primary instead of the personal avatar", async () => {
  staffApi.directory.mockResolvedValue({ items: [] });
  schoolApi.myCampus.mockResolvedValue({ items: [
    { id: "registration", campusId, schoolName: "Learning Academy", status: "ACTIVE", studentStatus: "ACTIVE", available: true },
  ] });
  const user = mount(`/learning?view=campus&campus=${campusId}`);
  const shortcuts = screen.getByRole("navigation", { name: "Account shortcuts" });
  await waitFor(() => expect(within(shortcuts).getAllByRole("link")[0]).toHaveAttribute("aria-label", "Open Learning Academy school campus"));
  expect(within(shortcuts).getAllByRole("link")[0]).toHaveAttribute("aria-current", "true");
  expect(within(shortcuts).getAllByRole("link")[0].textContent).toContain("LA");
  expect(within(shortcuts).getAllByRole("link")[1]).toHaveAttribute("aria-label", "Open personal account");
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  expect(screen.getByRole("navigation", { name: "Switch account" })
    .querySelector('[aria-current="page"]').textContent).toContain("Learning Academy");
});

it("uses the only active campus as primary when viewing the campus tab without a campus selector", async () => {
  staffApi.directory.mockResolvedValue({ items: [] });
  schoolApi.myCampus.mockResolvedValue({ items: [
    { id: "registration", campusId, schoolName: "Learning Academy", status: "ACTIVE", studentStatus: "ACTIVE", available: true },
  ] });
  mount("/learning?view=campus");
  await waitFor(() => expect(screen.getByRole("navigation", { name: "Account shortcuts" })
    .querySelector('[aria-current="true"]').getAttribute("aria-label")).toBe("Open Learning Academy school campus"));
});


it("shows all approved identities as directly clickable avatars, including beyond the first three", async () => {
  staffApi.directory.mockResolvedValue({ items: Array.from({ length: 6 }, (_, i) => ({
    id: `org-${i}`, name: `School ${i}`,
  })) });
  schoolApi.myCampus.mockResolvedValue({ items: [] });
  const user = mount();
  const shortcuts = screen.getByRole("navigation", { name: "Account shortcuts" });
  await waitFor(() => expect(within(shortcuts).getAllByRole("link")).toHaveLength(7));
  await user.click(within(shortcuts).getByRole("link", { name: "Open School 5 organization workspace" }));
  expect(screen.getByTestId("route").textContent).toBe("/organization-workspace/org-5");
});

it("protects unsaved edits when using direct avatar navigation", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab" }] });
  schoolApi.myCampus.mockResolvedValue({ items: [] });
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  render(<AuthContext.Provider value={{ account, logout: vi.fn() }}>
    <MemoryRouter initialEntries={["/profile"]}>
      <RouteWithUnsaved />
    </MemoryRouter>
  </AuthContext.Provider>);
  const user = userEvent.setup();
  const organization = await screen.findByRole("link", { name: "Open Community Lab organization workspace" });
  await user.click(organization);
  expect(screen.getByTestId("route").textContent).toBe("/profile");
  expect(confirm).toHaveBeenCalledOnce();
  confirm.mockReturnValue(true);
  await user.click(organization);
  expect(screen.getByTestId("route").textContent).toBe(`/organization-workspace/${organizationId}`);
});
function RouteWithUnsaved() {
  const location = useLocation();
  return <><HeaderProfileMenu hasWork={true} profileBusy={false} unsaved />
    <output data-testid="route">{location.pathname}</output></>;
}
