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
function Route() {
  const location = useLocation();
  return <><HeaderProfileMenu hasWork={true} profileBusy={false} unsaved={false} />
    <output data-testid="route">{location.pathname + location.search}</output></>;
}
function mount(path = "/explore") {
  render(<AuthContext.Provider value={{ account, logout: vi.fn() }}>
    <MemoryRouter initialEntries={[path]}><Route /></MemoryRouter>
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
  expect(staffApi.directory).toHaveBeenCalledWith(expect.any(AbortSignal), { tab: "approved" });
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  const menu = within(screen.getByRole("navigation", { name: "Switch account" }));
  expect(menu.queryByText("Former School")).toBeNull();
  expect(menu.queryByText("Waiting School")).toBeNull();
  await user.click(await menu.findByRole("button", { name: /Learning Academy/ }));
  expect(screen.getByTestId("route").textContent).toBe(`/learning?view=campus&campus=${campusId}`);
});

it("opens an authorized organization workspace and returns to personal context", async () => {
  staffApi.directory.mockResolvedValue({ items: [{ id: organizationId, name: "Community Lab", type: "COMPANY" }] });
  schoolApi.myCampus.mockResolvedValue({ items: [] });
  const user = mount();
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await user.click(await screen.findByRole("button", { name: /Community Lab/ }));
  expect(screen.getByTestId("route").textContent).toBe(`/organization-workspace/${organizationId}`);
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await user.click(screen.getByRole("button", { name: /Personal account/ }));
  expect(screen.getByTestId("route").textContent).toBe("/explore");
});

it("does not expose stale context shortcuts after an account-context read failure", async () => {
  staffApi.directory.mockRejectedValue(new Error("Unauthorized"));
  schoolApi.myCampus.mockRejectedValue(new Error("Unauthorized"));
  const user = mount();
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await screen.findByText("No active organization memberships or school enrollments.");
  expect(document.querySelectorAll(".bw-context-facepile .bw-context-avatar")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /Community Lab/ })).toBeNull();
});
