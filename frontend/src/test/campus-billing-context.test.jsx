import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyCampus from "../components/grade-school/MyCampus";
import { schoolApi } from "../api/grade-school";
vi.mock("../api/grade-school", () => ({ schoolApi: { myCampus: vi.fn() } }));
afterEach(cleanup);
const row = { id: "registration", campusId: "selected", schoolName: "Selected School", year: "2030", period: "Semester 1", section: "A", status: "ACTIVE", studentStatus: "ACTIVE", available: true };
it("selected Campus keeps billing restrictions and hides unrelated Campus records", async () => {
  schoolApi.myCampus.mockResolvedValue({ items: [{ ...row, billing: { balanceCents: 100, noticeAt: "2030-01-24", enforceAt: "2030-01-31", restricted: true } }, { ...row, id: "other", campusId: "other", schoolName: "Other School" }] });
  render(<MemoryRouter><MyCampus campusId="selected" /></MemoryRouter>);
  await screen.findByText("Selected School");
  expect(screen.queryByText("Other School")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("unpaid BrightWay registration fee");
  expect(screen.queryByRole("button", { name: "Open my Campus" })).toBeNull();
  expect(screen.getByRole("link", { name: "All my campuses" }).getAttribute("href")).toBe("/learning?view=campus");
});
it("selected Campus retains report access after the fee is settled", async () => {
  schoolApi.myCampus.mockResolvedValue({ items: [{ ...row, billing: { balanceCents: 0, noticeAt: "2030-01-24", enforceAt: "2030-01-31", restricted: false } }] });
  render(<MemoryRouter><MyCampus campusId="selected" /></MemoryRouter>);
  expect(await screen.findByRole("button", { name: "Open my Campus" })).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});
