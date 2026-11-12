import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CampusBilling from "../components/billing/CampusBilling";
import { managementAuthApi } from "../api/management-auth";
vi.mock("../api/management-auth", () => ({ managementAuthApi: { stepUp: vi.fn().mockResolvedValue({ verified: true }) } }));
import { billingApi } from "../api/billing";
vi.mock("../api/billing", () => ({ billingApi: { statement: vi.fn(), report: vi.fn(), adjust: vi.fn(), semester: vi.fn(), reconcile: vi.fn() } }));
const c1 = "11111111-1111-4111-8111-111111111111", c2 = "22222222-2222-4222-8222-222222222222";
const fixture = () => ({ campusId: "campus", balanceCents: 100, charges: [{ id: c1, engine: "GRADE_SCHOOL", learner: { fullName: "Synthetic Learner", username: "learner" }, label: "Semester 1", amountCents: 100, balanceCents: 100, dueAt: "2030-01-31", noticeAt: null, enforceAt: null, restricted: false, adjustments: [] }, { id: c2, engine: "GRADE_SCHOOL", learner: { fullName: "Settled Learner", username: "settled" }, label: "Semester 1", amountCents: 100, balanceCents: 0, adjustments: [] }], payments: [], ledger: [], semesters: [], periods: [], nextCursor: null, institutionFees: "Institution fees stay separate." });
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); billingApi.statement.mockImplementation(async () => fixture()); });
describe("Campus billing workflows", () => {
  it("selects outstanding fees, preserves input and reuses its key after a failed response", async () => {
    billingApi.report.mockRejectedValueOnce(Error("Connection lost. Retry with the same details.")).mockResolvedValueOnce({ id: "payment", status: "PENDING" });
    const user = userEvent.setup(); render(<CampusBilling campusId="campus" />);
    await screen.findByRole("heading", { name: "Registration charges" });
    expect(screen.getByRole("checkbox", { name: /Settled Learner/ }).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Select outstanding shown" })); await user.type(screen.getByLabelText("Payment reference"), "Receipt 808");
    await user.click(screen.getByRole("button", { name: "Report payment for confirmation" })); await screen.findByRole("alert"); expect(screen.getByLabelText("Payment reference").value).toBe("Receipt 808");
    await user.click(screen.getByRole("button", { name: "Report payment for confirmation" })); await screen.findByText(/Payment reported. Your balance updates/);
    const [first, retry] = billingApi.report.mock.calls.map(c => c[1]); expect(first.requestKey).toBe(retry.requestKey); expect(first.allocations).toEqual([{ chargeId: c1, amountCents: 100 }]); expect(first.reference).toBe("Receipt 808");
  });
  it("shows notice and enforcement states while pending reports keep fees outstanding", async () => {
    billingApi.statement.mockResolvedValue({ ...fixture(), charges: [{ ...fixture().charges[0], noticeAt: "2030-01-24", enforceAt: "2030-01-31", restricted: true }], payments: [{ id: "p", amountCents: 100, reference: "Pending transfer", status: "PENDING", createdAt: "2030-01-25" }] });
    render(<CampusBilling campusId="campus" />); await screen.findByText("Access restricted"); expect(screen.getByText("PENDING")).toBeTruthy(); expect(screen.getByText("Institution fees stay separate. Admission acceptance alone never creates a charge.")).toBeTruthy();
  });
  it("offers adjustments in management and retains their reason", async () => {
    billingApi.adjust.mockResolvedValue({ id: "adjustment" }); const user = userEvent.setup(); render(<CampusBilling campusId="campus" management />); await screen.findByRole("heading", { name: "Registration charges" }); expect(screen.queryByLabelText("Payment reference")).toBeNull();
    const row = screen.getByText("Synthetic Learner").closest("tr"); await user.click(within(row).getByRole("button", { name: "Adjust fee" })); await user.type(screen.getByLabelText("Adjustment (USD cents)"), "-100"); await user.type(screen.getByLabelText("Reason"), "Documented institution waiver."); await user.click(screen.getByRole("button", { name: "Record adjustment" })); await user.type(screen.getByLabelText("Your management password"), "synthetic password"); await user.type(screen.getByLabelText("Fresh management MFA code"), "123456"); await user.click(screen.getByRole("button", { name: "Confirm action" })); expect(managementAuthApi.stepUp).toHaveBeenCalled();
    await waitFor(() => expect(billingApi.adjust).toHaveBeenCalled()); expect(billingApi.adjust.mock.calls[0].slice(0, 2)).toEqual(["campus", c1]); expect(billingApi.adjust.mock.calls[0][2]).toMatchObject({ amountCents: -100, reason: "Documented institution waiver." });
  });
});
