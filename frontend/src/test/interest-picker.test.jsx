import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import InterestPicker from "../components/profile/InterestPicker";

function Harness({ initial = "Technology", disabled = false }) {
  const [value, setValue] = useState(initial);
  return <InterestPicker value={value} onChange={setValue} disabled={disabled} />;
}

it("filters predefined choices without losing selected interests or creating free-text values", async () => {
  render(<Harness />); const user = userEvent.setup();
  const search = screen.getByRole("searchbox", { name: "Search interests" });
  await user.type(search, "Research");
  expect(screen.queryByRole("checkbox", { name: "Technology", exact: true })).toBeNull();
  expect(screen.getByRole("button", { name: "Remove Technology" })).toBeTruthy();
  await user.click(screen.getByRole("checkbox", { name: "Research", exact: true }));
  await user.clear(search);
  expect(screen.getByRole("checkbox", { name: "Technology", exact: true }).checked).toBe(true);
  expect(screen.getByRole("checkbox", { name: "Research", exact: true }).checked).toBe(true);
  await user.type(search, "An arbitrary interest");
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.getByText("No interests match your search.")).toBeTruthy();
  expect(screen.getByText("2 of 20 selected")).toBeTruthy();
});

it("limits selections to twenty while allowing removal at the limit", async () => {
  render(<Harness initial="" />); const user = userEvent.setup();
  const choices = screen.getAllByRole("checkbox");
  for (const choice of choices.slice(0, 20)) await user.click(choice);
  expect(screen.getByText("20 of 20 selected")).toBeTruthy();
  expect(choices[20].disabled).toBe(true);
  expect(choices[0].disabled).toBe(false);
  await user.click(choices[0]); expect(choices[20].disabled).toBe(false);
});

it("preserves legacy selections, avoids case duplicates and prevents edits while disabled", async () => {
  const { unmount } = render(<Harness initial={"technology\nChurch Media"} />);
  expect(screen.getByRole("checkbox", { name: "Technology", exact: true }).checked).toBe(true);
  expect(screen.queryByRole("checkbox", { name: "Church Media" })).toBeNull();
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Technology", exact: true }));
  expect(screen.getByText("1 of 20 selected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Church Media" })).toBeTruthy();
  unmount(); render(<Harness disabled />);
  expect(screen.getByRole("button", { name: "Remove Technology" }).disabled).toBe(true);
  expect(screen.getByRole("searchbox").disabled).toBe(true);
  expect(screen.getAllByRole("checkbox").every((choice) => choice.disabled)).toBe(true);
});

it("does not submit the profile form when Enter is pressed in the interest search", () => {
  render(<Harness />);
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  fireEvent(screen.getByRole("searchbox"), event);
  expect(event.defaultPrevented).toBe(true);
});
