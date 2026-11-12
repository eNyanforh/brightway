import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import PostPhotoGallery from "../components/posts/PostPhotoGallery";
import PostMediaPicker from "../components/posts/PostMediaPicker";
import { organizationPostsApi } from "../api/organization-posts";

const images = Array.from({ length: 4 }, (_, index) => ({
  id: "photo-" + index, name: "project-" + (index + 1) + ".webp", kind: "IMAGE", size: 100,
}));
const openPhoto = index => screen.getByRole("button", { name: new RegExp("^Open photo " + index + " of") });

it("adapts a single photo to its dimensions and balances landscape multi-photo layouts", () => {
  const { rerender } = render(<PostPhotoGallery images={images.slice(0, 1)} />);
  const image = screen.getByRole("img", { name: images[0].name });
  Object.defineProperties(image, { naturalWidth: { value: 800, configurable: true }, naturalHeight: { value: 1200, configurable: true } });
  fireEvent.load(image);
  expect(screen.getByRole("group", { name: "Post photos" }).style.aspectRatio).toMatch(/^0\.8(?: \/ 1)?$/);
  rerender(<PostPhotoGallery images={images.slice(0, 2)} />);
  expect(screen.getByRole("group", { name: "Post photos" }).dataset.layout).toBe("grid");
  Object.defineProperties(image, { naturalWidth: { value: 1600, configurable: true }, naturalHeight: { value: 800, configurable: true } });
  fireEvent.load(image);
  expect(screen.getByRole("group", { name: "Post photos" }).dataset.layout).toBe("stacked");
  rerender(<PostPhotoGallery images={images.slice(0, 3)} />);
  expect(screen.getByRole("group", { name: "Post photos" }).dataset.layout).toBe("landscape");
});

it("opens the selected photo, supports keyboard and thumbnail navigation, and restores focus and scrolling", async () => {
  const user = userEvent.setup();
  document.body.style.overflow = "auto";
  render(<PostPhotoGallery images={images} />);
  const trigger = openPhoto(2);
  await user.click(trigger);
  const viewer = screen.getByRole("dialog", { name: "Photo viewer" });
  expect(within(viewer).getByText("2 of 4")).toBeTruthy();
  expect(document.activeElement).toBe(within(viewer).getByRole("button", { name: "Close photo viewer" }));
  expect(document.body.style.overflow).toBe("hidden");
  await user.keyboard("{ArrowRight}");
  expect(within(viewer).getByRole("img", { name: images[2].name })).toBeTruthy();
  await user.click(within(viewer).getByRole("button", { name: "View photo 1" }));
  expect(within(viewer).getByRole("button", { name: "Previous photo" }).disabled).toBe(true);
  expect(within(viewer).getByRole("button", { name: "View photo 1" }).getAttribute("aria-pressed")).toBe("true");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("auto");
  document.body.style.overflow = "";
});

it("keeps the surrounding editor open when Escape or Tab is used in the photo viewer", async () => {
  const user = userEvent.setup();
  const editorKeys = vi.fn();
  document.addEventListener("keydown", editorKeys);
  try {
    render(<PostPhotoGallery images={images} />);
    await user.click(openPhoto(1));
    await user.keyboard("{Tab}{Escape}");
    expect(editorKeys).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  } finally { document.removeEventListener("keydown", editorKeys); }
});

it("swipes between photos, ignores vertical gestures and leaves zoomed photos available for panning", async () => {
  const user = userEvent.setup();
  render(<PostPhotoGallery images={images} />);
  await user.click(openPhoto(1));
  const viewer = screen.getByRole("dialog");
  const viewport = viewer.querySelector(".bw-photo-viewer-viewport");
  const swipe = (x, y) => {
    fireEvent.touchStart(viewport, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: x, clientY: y }] });
  };
  swipe(180, 300);
  expect(within(viewer).getByText("1 of 4")).toBeTruthy();
  swipe(70, 110);
  expect(within(viewer).getByText("2 of 4")).toBeTruthy();
  fireEvent.load(within(viewer).getByRole("img", { name: images[1].name }));
  await user.click(within(viewer).getByRole("button", { name: "Zoom in" }));
  expect(viewport.dataset.zoomed).toBe("true");
  swipe(70, 110);
  expect(within(viewer).getByText("2 of 4")).toBeTruthy();
  await user.click(within(viewer).getByRole("button", { name: "Next photo" }));
  expect(viewport.dataset.zoomed).toBe("false");
  expect(within(viewer).getByText("3 of 4")).toBeTruthy();
});

it("provides a recoverable error and only enables zoom after the photo loads", async () => {
  const user = userEvent.setup();
  render(<PostPhotoGallery images={images.slice(0, 1)} />);
  await user.click(openPhoto(1));
  const viewer = screen.getByRole("dialog");
  expect(within(viewer).getByRole("button", { name: "Zoom in" }).disabled).toBe(true);
  fireEvent.error(within(viewer).getByRole("img", { name: images[0].name }));
  expect(within(viewer).getByText("This photo couldn’t load")).toBeTruthy();
  await user.click(within(viewer).getByRole("button", { name: "Try again" }));
  fireEvent.load(within(viewer).getByRole("img", { name: images[0].name }));
  expect(within(viewer).getByRole("button", { name: "Zoom in" }).disabled).toBe(false);
  expect(within(viewer).getByRole("link", { name: "Open original photo in a new tab" }).getAttribute("href")).toContain("photo-0");
  expect(within(viewer).queryByRole("button", { name: "Next photo" })).toBeNull();
});

it("shows large selected-photo previews and removes only the chosen uploaded photo", async () => {
  const user = userEvent.setup();
  const discard = vi.spyOn(organizationPostsApi, "discardPostMedia").mockResolvedValue({ discarded: true });
  const removed = vi.fn();
  render(<PostMediaPicker media={images.slice(0, 2)} onRemoved={removed} />);
  expect(screen.getByRole("group", { name: "Selected photos" })).toBeTruthy();
  expect(screen.getByText("2 of 4 added")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Remove attachment " + images[1].name }));
  expect(discard).toHaveBeenCalledWith(images[1].id);
  expect(removed).toHaveBeenCalledWith(images[1].id);
  expect(screen.queryByRole("dialog")).toBeNull();
});


it("wraps Tab and Shift+Tab inside the viewer at both focus boundaries", async () => {
  const user = userEvent.setup();
  render(<PostPhotoGallery images={images} />);
  await user.click(openPhoto(1));
  const viewer = screen.getByRole("dialog");
  // Loading disables zoom, so the original-photo link is the first control.
  const first = within(viewer).getByRole("link", { name: "Open original photo in a new tab" });
  const last = within(viewer).getByRole("button", { name: "View photo 4" });
  last.focus();
  await user.tab();
  expect(document.activeElement).toBe(first);
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(last);
});
