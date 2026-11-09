import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import PostCaption from "../components/posts/PostCaption";
import {
  CAPTION_PREVIEW_CHARACTERS,
  CAPTION_PREVIEW_LINES,
  previewPostCaption,
} from "../components/posts/post-caption-preview";

it("leaves short captions fully readable without a toggle", () => {
  const { container } = render(<PostCaption body={"Learned JavaScript.\nBuilt my first project."} />);
  expect(container.querySelector(".bw-post-text").textContent).toBe("Learned JavaScript.\nBuilt my first project.");
  expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
});

it("collapses lengthy captions, reveals the exact complete body, then collapses again", async () => {
  const full = "The project was built through many iterations. ".repeat(12) + "Final lesson: test early.";
  const user = userEvent.setup();
  const { container } = render(<PostCaption body={full} className="bw-post-story-body" />);
  const paragraph = container.querySelector(".bw-post-story-body");
  expect(paragraph).toBeTruthy();
  expect(paragraph.textContent.length).toBeLessThan(full.length);
  expect(paragraph.textContent).not.toContain("Final lesson:");
  const more = screen.getByRole("button", { name: "Read more" });
  expect(more.getAttribute("aria-controls")).toBe(paragraph.id);
  expect(more.getAttribute("aria-expanded")).toBe("false");
  await user.click(more);
  expect(paragraph.textContent).toBe(full);
  const less = screen.getByRole("button", { name: "Show less" });
  expect(less.getAttribute("aria-expanded")).toBe("true");
  await user.click(less);
  expect(paragraph.textContent.length).toBeLessThan(full.length);
});

it("shortens many-line captions even if their total length is small", async () => {
  const body = Array.from({ length: CAPTION_PREVIEW_LINES + 2 },
    (_, index) => "Line " + (index + 1)).join("\n");
  expect(body.length).toBeLessThan(CAPTION_PREVIEW_CHARACTERS);
  const { preview, shortened } = previewPostCaption(body);
  expect(shortened).toBe(true);
  expect(preview).toContain("Line 5");
  expect(preview).not.toContain("Line 6");
  const user = userEvent.setup();
  render(<PostCaption body={body} />);
  expect(screen.queryByText(/Line 7/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Read more" }));
  expect(document.querySelector(".bw-post-text").textContent).toBe(body);
});

it("handles long text with emoji without corrupting a surrogate pair", () => {
  const body = "🎓".repeat(CAPTION_PREVIEW_CHARACTERS) + "Last sentence.";
  const { preview, shortened } = previewPostCaption(body);
  expect(shortened).toBe(true);
  expect(Array.from(preview)).toHaveLength(CAPTION_PREVIEW_CHARACTERS);
  expect(preview).not.toContain("\uFFFD");
});
