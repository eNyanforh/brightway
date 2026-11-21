import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CampusFlow } from "../pages/CampusActivationPage";
import { campusApi } from "../api/campus";
vi.mock("../api/campus", () => ({ campusApi: { onboarding: vi.fn(), saveOnboarding: vi.fn(), completeOnboarding: vi.fn(), enableEngine: vi.fn() } }));
const initial = () => ({ organizationName: "Training NGO", eligible: true, canSetup: true, eligibility: { reasons: [] }, campus: null, administrator: { membershipId: "member", username: "owner" }, draft: { step: 1, version: 0, displayName: "Training NGO", enabledEngines: [] } });
const mount = () => render(<MemoryRouter initialEntries={["/campus/org/setup"]}><Routes><Route path="/campus/org/setup" element={<CampusFlow id="org" setup />} /><Route path="/campus/org" element={<h1>Dedicated Campus workspace</h1>} /><Route path="/organization-workspace/org" element={<h1>Ordinary Organization dashboard</h1>} /></Routes></MemoryRouter>);
beforeEach(() => { vi.resetAllMocks(); campusApi.onboarding.mockResolvedValue(initial()); campusApi.saveOnboarding.mockImplementation(async (_id, body) => ({ ...body, version: body.expectedVersion + 1 })); campusApi.completeOnboarding.mockResolvedValue({ workspacePath: "/campus/org", version: 2 }); });
afterEach(cleanup);
it("uses exactly four steps and routes activation directly to the dedicated workspace", async () => {
  const user = userEvent.setup(); mount();
  await screen.findByRole("heading", { name: "Eligibility Verification" });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByLabelText("Campus display name")).value).toBe("Training NGO");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(await screen.findByRole("checkbox", { name: /Grade School/ }));
  await user.click(screen.getByRole("checkbox", { name: /TVET/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(await screen.findByRole("checkbox", { name: /confirm my responsibility/ }));
  await user.click(screen.getByRole("button", { name: "Activate and open Campus" }));
  await screen.findByRole("heading", { name: "Dedicated Campus workspace" });
  expect(screen.queryByText("Ordinary Organization dashboard")).toBeNull();
  expect(campusApi.completeOnboarding).toHaveBeenCalledWith("org", { expectedVersion: 3, administratorMembershipId: "member", confirmed: true });
});
it("resumes saved engine selection and retries interrupted saves with the identical request", async () => {
  campusApi.onboarding.mockResolvedValue({ ...initial(), draft: { step: 3, version: 2, displayName: "Saved Campus", enabledEngines: ["TVET"] } });
  campusApi.saveOnboarding.mockRejectedValueOnce(Error("Connection interrupted"));
  const user = userEvent.setup(); mount();
  expect((await screen.findByRole("checkbox", { name: /TVET/ })).checked).toBe(true);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Campus Administration" });
  expect(campusApi.saveOnboarding.mock.calls[0]).toEqual(campusApi.saveOnboarding.mock.calls[1]);
});
it("reuses an active Campus and does not reactivate it", async () => {
  campusApi.onboarding.mockResolvedValue({ ...initial(), campus: { status: "ACTIVE" } }); mount();
  await screen.findByRole("heading", { name: "Dedicated Campus workspace" });
  expect(campusApi.completeOnboarding).not.toHaveBeenCalled();
});
it("denies unavailable preview access without showing activation controls", async () => {
  campusApi.onboarding.mockRejectedValue(Error("Virtual Campus is unavailable.")); mount();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Virtual Campus is unavailable."));
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
});
