import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import SkillPicker from "../components/profile/SkillPicker";

function Harness({ initial = "Communication", disabled = false }) {
  const [value, setValue] = useState(initial);
  return <SkillPicker value={value} onChange={setValue} disabled={disabled} />;
}

it("filters predefined choices without losing selected skills or creating free-text values", async () => {
  render(<Harness />); const user = userEvent.setup();
  const search = screen.getByRole("searchbox", { name: "Search skills" });
  await user.type(search, "Python");
  expect(screen.queryByRole("checkbox", { name: "Communication", exact: true })).toBeNull();
  expect(screen.getByRole("button", { name: "Remove Communication" })).toBeTruthy();
  await user.click(screen.getByRole("checkbox", { name: "Python", exact: true }));
  await user.clear(search);
  expect(screen.getByRole("checkbox", { name: "Communication", exact: true }).checked).toBe(true);
  expect(screen.getByRole("checkbox", { name: "Python", exact: true }).checked).toBe(true);
  await user.type(search, "An arbitrary skill");
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.getByText("No skills match your search.")).toBeTruthy();
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
  const { unmount } = render(<Harness initial={"communication\nChurch Media"} />);
  expect(screen.getByRole("checkbox", { name: "Communication", exact: true }).checked).toBe(true);
  expect(screen.queryByRole("checkbox", { name: "Church Media" })).toBeNull();
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Communication", exact: true }));
  expect(screen.getByText("1 of 20 selected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Church Media" })).toBeTruthy();
  unmount(); render(<Harness disabled />);
  expect(screen.getByRole("button", { name: "Remove Communication" }).disabled).toBe(true);
  expect(screen.getByRole("searchbox").disabled).toBe(true);
  expect(screen.getAllByRole("checkbox").every((choice) => choice.disabled)).toBe(true);
});

it("does not submit the profile form when Enter is pressed in the skill search", () => {
  render(<Harness />);
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  fireEvent(screen.getByRole("searchbox"), event);
  expect(event.defaultPrevented).toBe(true);
});