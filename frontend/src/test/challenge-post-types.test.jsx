import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import ChallengePostTypes from "../components/opportunities/ChallengePostTypes";
import ChallengeApplicationPosts from "../components/opportunities/ChallengeApplicationPosts";
import { countChallengeWords, newChallengePostType } from "../../../shared/challenge-submissions.mjs";

it("Challenge post builder adds multiple types with their own constraints", async () => {
  const user = userEvent.setup();
  const formats = [
    newChallengePostType("VIDEO_POST", "11111111-1111-4111-8111-111111111111"),
    newChallengePostType("CAPTION", "22222222-2222-4222-8222-222222222222"),
  ];
  const changes = vi.fn();
  const { rerender } = render(<ChallengePostTypes requirements={formats} onChange={changes} />);
  expect(screen.getByRole("spinbutton", { name: "Post type 1 Maximum duration" })).toBeTruthy();
  expect(screen.getByRole("spinbutton", { name: "Post type 2 Maximum words" })).toBeTruthy();
  expect(screen.queryByRole("spinbutton", { name: "Post type 2 Maximum duration" })).toBeNull();
  await user.selectOptions(screen.getByRole("combobox", { name: "Post type 2" }), "PHOTO_POST");
  const updated = changes.mock.calls.at(-1)[0];
  expect(updated[1]).toEqual({ id: formats[1].id, type: "PHOTO_POST", minImages: 1, maxImages: 4 });
  rerender(<ChallengePostTypes requirements={updated} onChange={changes} />);
  expect(screen.getByRole("spinbutton", { name: "Post type 2 Maximum photos" })).toBeTruthy();
  expect(within(screen.getByRole("combobox", { name: "Post type 2" }))
    .getByRole("option", { name: "Video post" }).disabled).toBe(true);
});

it("caption requirement counts words live and allows a link to an existing BrightWay video post", async () => {
  const caption = newChallengePostType("CAPTION", "11111111-1111-4111-8111-111111111111");
  const video = newChallengePostType("VIDEO_POST", "22222222-2222-4222-8222-222222222222");
  const onChange = vi.fn();
  render(<MemoryRouter><ChallengeApplicationPosts requirements={[caption, video]}
    answers={{ [caption.id]: "", [video.id]: "" }} onChange={onChange} /></MemoryRouter>);
  fireEvent.change(screen.getByRole("textbox", { name: "Challenge caption" }),
    { target: { value: "A better learning experience" } });
  expect(onChange).toHaveBeenCalledWith(caption.id, "A better learning experience");
  expect(countChallengeWords("A better learning experience")).toBe(4);
  const postId = "33333333-3333-4333-8333-333333333333";
  fireEvent.change(screen.getByRole("textbox", { name: "BrightWay Video post link" }), {
    target: { value: "https://brightway.me/explore/posts/member/" + postId },
  });
  expect(onChange).toHaveBeenCalledWith(video.id, postId);
});

it("submitted captions and post links are visible in private organizer review", () => {
  const caption = newChallengePostType("CAPTION", "11111111-1111-4111-8111-111111111111");
  const video = newChallengePostType("VIDEO_POST", "22222222-2222-4222-8222-222222222222");
  const postId = "33333333-3333-4333-8333-333333333333";
  render(<MemoryRouter><ChallengeApplicationPosts readOnly requirements={[caption, video]}
    answers={{ [caption.id]: "We made a learning video", [video.id]: postId }} /></MemoryRouter>);
  expect(screen.getByText("We made a learning video")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View submitted BrightWay post" }).getAttribute("href"))
    .toBe("/explore/posts/member/" + postId);
});
