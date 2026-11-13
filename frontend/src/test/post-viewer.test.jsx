import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { PostCard } from "../components/posts/PostsPanel";
import PostViewer from "../components/posts/PostViewer";

const post = {
  id: "11111111-1111-4111-8111-111111111111", type: "ACHIEVEMENT",
  body: "Our first community research project.", createdAt: "2026-11-10T10:00:00Z",
  member: { name: "Maya Cole", username: "maya", verified: true },
  tags: ["Research"], views: 12, saved: false, reposted: false,
  reaction: { liked: false, count: 3 },
};

it("opens the post from its body or keyboard while keeping nested actions independent", async () => {
  const onOpen = vi.fn(), onLike = vi.fn();
  render(<MemoryRouter><PostCard post={post} timeline onOpen={onOpen} onLike={onLike} trackViews={false} /></MemoryRouter>);
  const card = screen.getByRole("article", { name: "Post by Maya Cole" });
  const user = userEvent.setup();
  await user.click(screen.getByText(post.body));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(post);
  expect(document.activeElement).toBe(card);
  onOpen.mockClear();
  await user.keyboard("{Enter}");
  await user.keyboard(" ");
  expect(onOpen).toHaveBeenCalledTimes(2);
  onOpen.mockClear();
  await user.click(screen.getByRole("button", { name: "Celebrate" }));
  expect(onLike).toHaveBeenCalledExactlyOnceWith(post);
  await user.click(screen.getByRole("button", { name: "Post options" }));
  expect(screen.getByRole("menu", { name: "Post options" })).toBeTruthy();
  expect(onOpen).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Open post viewer" })).toBeNull();
  expect(screen.queryByLabelText("Distribution topics")).toBeNull();
  expect(screen.queryByText("Research")).toBeNull();
  expect(screen.getByLabelText("12 views").querySelector("svg")).toBeNull();
  expect(post.tags).toEqual(["Research"]);
});

it("lets people select post text without opening the viewer", () => {
  const onOpen = vi.fn();
  render(<MemoryRouter><PostCard post={post} timeline onOpen={onOpen} trackViews={false} /></MemoryRouter>);
  const text = screen.getByText(post.body);
  const range = document.createRange();
  range.selectNodeContents(text);
  const selection = window.getSelection();
  selection.removeAllRanges(); selection.addRange(range);
  fireEvent.click(text);
  expect(onOpen).not.toHaveBeenCalled();
  selection.removeAllRanges();
});

it("navigates only within loaded posts, respects text entry and restores the opener", async () => {
  const next = { ...post, id: "22222222-2222-4222-8222-222222222222" };
  const onNavigate = vi.fn(), onClose = vi.fn();
  const opener = document.createElement("button");
  document.body.appendChild(opener); opener.focus();
  const rendered = render(<PostViewer posts={[post, next]} post={post} onNavigate={onNavigate} onClose={onClose}
    renderPost={() => <article><p>{post.body}</p><input aria-label="Reply" /></article>} />);
  const viewer = screen.getByRole("dialog", { name: "Post viewer" });
  expect(document.body.style.overflow).toBe("hidden");
  expect(within(viewer).getByRole("button", { name: "Previous post" }).disabled).toBe(true);
  const user = userEvent.setup();
  await user.click(screen.getByRole("textbox", { name: "Reply" }));
  await user.keyboard("{ArrowDown}");
  expect(onNavigate).not.toHaveBeenCalled();
  await user.click(within(viewer).getByRole("button", { name: "Next post" }));
  expect(onNavigate).toHaveBeenCalledExactlyOnceWith(next);
  rendered.unmount();
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
