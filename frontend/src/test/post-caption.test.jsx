import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PostCaption from "../components/posts/PostCaption";

// jsdom has no layout engine; emulate measured heights for overflow detection.
beforeEach(() => {
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function () {
    const text = this.textContent ?? "";
    return text.length > 120 || text.split("\n").length > 2 ? 90 : 38;
  });
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(38);
});
afterEach(() => vi.restoreAllMocks());

it("keeps short one- and two-line descriptions fully readable without a toggle", () => {
  const body = "Learned JavaScript.\nBuilt my first project.";
  const { container } = render(<PostCaption body={body} />);
  const caption = container.querySelector(".bw-post-text");
  expect(caption.textContent).toBe(body);
  expect(caption.classList.contains("bw-post-caption--collapsed")).toBe(true);
  expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
});

it("shows exactly two CSS-clamped lines, See more, then full body and See less", async () => {
  const body = "The project was built through many iterations. ".repeat(12)
    + "Final lesson: test early.";
  const user = userEvent.setup();
  const { container } = render(<PostCaption body={body} className="bw-post-story-body" />);
  const paragraph = container.querySelector(".bw-post-story-body");
  expect(paragraph.textContent).toBe(body);
  expect(paragraph.classList.contains("bw-post-caption--collapsed")).toBe(true);
  const more = screen.getByRole("button", { name: "See more" });
  expect(more.getAttribute("aria-controls")).toBe(paragraph.id);
  expect(more.getAttribute("aria-expanded")).toBe("false");

  await user.click(more);
  expect(paragraph.textContent).toBe(body);
  expect(paragraph.classList.contains("bw-post-caption--collapsed")).toBe(false);
  const less = screen.getByRole("button", { name: "See less" });
  expect(less.getAttribute("aria-expanded")).toBe("true");
  await user.click(less);
  expect(paragraph.classList.contains("bw-post-caption--collapsed")).toBe(true);
  expect(screen.getByRole("button", { name: "See more" })).toBeTruthy();
});

it("truncates many-line captions even when they are fewer than 120 characters", async () => {
  const body = "First line\nSecond line\nThird line";
  const { container } = render(<PostCaption body={body} />);
  const text = container.querySelector(".bw-post-text");
  expect(text.textContent).toBe(body);
  const more = screen.getByRole("button", { name: "See more" });
  await userEvent.setup().click(more);
  expect(text.classList.contains("bw-post-caption--collapsed")).toBe(false);
  expect(text.textContent).toBe(body);
});

it("keeps original emoji and long words intact after expansion", async () => {
  const body = "🎓".repeat(180) + " Long educational opportunity description.";
  const { container } = render(<PostCaption body={body} />);
  expect(screen.getByRole("button", { name: "See more" })).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "See more" }));
  expect(container.querySelector(".bw-post-text").textContent).toBe(body);
});
