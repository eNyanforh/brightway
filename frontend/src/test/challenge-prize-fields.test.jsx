import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ChallengePrizeFields from "../components/opportunities/ChallengePrizeFields";
import { newChallengePrize } from "../../../shared/challenges.mjs";

it("shows amount and currency for Cash and sends numeric amounts", async () => {
  const onChange = vi.fn();
  render(<ChallengePrizeFields prize={newChallengePrize("CASH")} index={0} onChange={onChange} />);
  expect(screen.getByRole("spinbutton", { name: "Prize 1 amount" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Prize 1 currency" })).toBeTruthy();
  expect(screen.queryByLabelText("Scholarship Coverage")).toBeNull();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Prize 1 amount" }), { target: { value: "500" } });
  expect(onChange).toHaveBeenLastCalledWith({ type: "CASH", amount: 500, currency: "USD" });
  await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Prize 1 currency" }), "LRD");
  expect(onChange).toHaveBeenLastCalledWith({ type: "CASH", amount: "", currency: "LRD" });
});

it.each([
  ["SCHOLARSHIP", "Scholarship Coverage", "Institution (optional)"],
  ["CERTIFICATE", "Certificate Title", "Issued By (optional)"],
  ["MENTORSHIP", "Mentorship Focus", "Number of Sessions"],
  ["EQUIPMENT", "Equipment or Item", "Quantity"],
  ["INTERNSHIP", "Internship Role", "Duration"],
  ["OTHER", "Prize Name", "Description"],
])("%s prize renders its own required fields", (type, fieldOne, fieldTwo) => {
  render(<ChallengePrizeFields prize={newChallengePrize(type)} index={0} onChange={() => {}} />);
  expect(screen.getByLabelText(fieldOne)).toBeTruthy();
  expect(screen.getByLabelText(fieldTwo)).toBeTruthy();
  expect(screen.queryByRole("spinbutton", { name: "Prize 1 amount" })).toBeNull();
});

it("switching prize types resets incompatible fields", async () => {
  const onChange = vi.fn();
  render(<ChallengePrizeFields prize={{ type: "CASH", amount: 500, currency: "USD" }}
    index={1} onChange={onChange} />);
  await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Prize 2 type" }), "EQUIPMENT");
  expect(onChange).toHaveBeenLastCalledWith({ type: "EQUIPMENT", item: "", quantity: 1 });
});

it("preserves old published rewards and offers explicit migration to the new form", async () => {
  const onChange = vi.fn();
  render(<ChallengePrizeFields prize={{ type: "CASH", description: "US$500" }}
    index={0} onChange={onChange} />);
  expect(screen.getByLabelText("Prize 1 existing details")).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "Use the new Cash form" }));
  expect(onChange).toHaveBeenLastCalledWith(newChallengePrize("CASH"));
});
