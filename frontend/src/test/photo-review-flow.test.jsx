import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import { AuthContext } from "../auth/auth-context";
import AppRoutes from "../routes/AppRoutes";
import ProfilePhotoReviewsPage from "../pages/ProfilePhotoReviewsPage";
import { theme } from "../styles/theme";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const OriginalURL = URL;
  vi.stubGlobal("URL", class extends OriginalURL {
    static createObjectURL = vi.fn(() => `blob:photo-${Math.random()}`);
    static revokeObjectURL = vi.fn();
  });
});
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
const applicant = { id: "owner", username: "owner", person: { firstName: "Test", lastName: "Owner" } };
const requestId = "11111111-1111-4111-8111-111111111111";
const pending = { id: requestId, version: 1, state: "PENDING", photoAssetId: "candidate-photo", note: null };
function ownerProfile() {
  return { id: "profile", version: 1, headline: "Student", bio: null, photo: { id: "approved-photo" },
    photoReview: { required: true, pending: null, latestDecision: null },
    location: { countryCode: "US", locality: "City" }, careerField: { mode: "EXPLORING" }, careerGoals: null,
    skills: ["Communication"], interests: ["Technology"], education: { mode: "NONE", records: [] }, experience: { mode: "NONE", records: [] },
    completion: { profileVersion: 1, complete: true, eligibleToRequestVerification: true, checks: [], manualVerificationEligibility: { requirementsMet: true, checks: [
      { code: "PROFILE_COMPLETE_REQUIRED", satisfied: true }, { code: "VERIFIED_EDUCATION_REQUIRED", satisfied: true }, { code: "VERIFIED_EXPERIENCE_REQUIRED", satisfied: true },
    ] } },
  };
}
function mountOwner(profile, handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/auth/me")) return response({ account: applicant });
    if (url.endsWith("/admin/manual-identity/access")) return response("Access denied.", 403);
    if (url.endsWith("/manual-identity/status")) return response({ accountId: applicant.id, profileVersion: profile.version, status: "APPROVED", identityVerified: true, identityDetailsComplete: true, canSubmit: false });
    if (url.endsWith("/profile/me/completion")) return response({ ...profile.completion, profileVersion: profile.version });
    if (url.endsWith("/profile/me") && options?.method !== "PATCH") return response({ profile: structuredClone(profile) });
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={["/profile"]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return { user: userEvent.setup(), fetchMock };
}
async function keepHeadline(user) {
  await user.click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  fireEvent.change(screen.getByLabelText("Headline", { exact: true }), { target: { value: "Keep my draft" } });
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
}
function expectOldPortrait() {
  expect(screen.getByRole("button", { name: "Open account menu" }).querySelector("img").getAttribute("src")).toBe("/api/v1/photos/approved-photo");
  expect(document.querySelector(".bw-profile-photo-button img").getAttribute("src")).toBe("/api/v1/photos/approved-photo");
}

it("submits a verified replacement without publishing it in either portrait and keeps the verified badge", async () => {
  const profile = ownerProfile();
  const { user, fetchMock } = mountOwner(profile, async (url) => {
    if (url.endsWith("/photo")) {
      profile.version++; profile.photoReview.pending = pending;
      return response({ photoAssetId: "approved-photo", uploadedPhotoAssetId: "candidate-photo", profileVersion: profile.version, reviewRequired: true, photoReview: profile.photoReview }, 201);
    }
    throw Error(`Unexpected ${url}`);
  });
  await screen.findByRole("img", { name: "Verified identity" });
  await user.click(screen.getByRole("button", { name: "Change profile picture" }));
  await user.upload(screen.getByLabelText("Choose profile picture"), new File(["image"], "replacement.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "Submit photo for review" }));
  await screen.findByText("Replacement photo submitted for review. Your approved photo stays visible.");
  expectOldPortrait();
  await screen.findByRole("img", { name: "Verified identity" });
  expect(document.querySelector('.bw-profile-photo-review img').getAttribute("src")).toBe("/api/v1/photos/candidate-photo");
  expect(fetchMock.mock.calls.find(([url]) => url.endsWith("/photo"))[1].headers["X-Profile-Version"]).toBe("1");
});

it("cancels only the pending photo and rebases retained introduction edits onto the returned version", async () => {
  const profile = ownerProfile(); profile.photoReview.pending = pending;
  const { user, fetchMock } = mountOwner(profile, async (url, options) => {
    if (options?.method === "DELETE") { profile.version++; profile.photoReview.pending = null; return response({ photoAssetId: "approved-photo", profileVersion: profile.version, photoReview: profile.photoReview }); }
    if (options?.method === "PATCH") { profile.headline = JSON.parse(options.body).changes.headline; profile.version++; return response({ profile: structuredClone(profile) }); }
    throw Error(`Unexpected ${url}`);
  });
  await screen.findByRole("img", { name: "Verified identity" }); await keepHeadline(user);
  await user.click(screen.getByRole("button", { name: "Cancel photo request" }));
  await screen.findByText("Photo request cancelled. Your approved photo is unchanged."); expectOldPortrait();
  const cancelled = fetchMock.mock.calls.find(([, options]) => options?.method === "DELETE");
  expect(JSON.parse(cancelled[1].body)).toEqual({ expectedVersion: 1, expectedProfileVersion: 1 });
  await user.click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  expect(screen.getByLabelText("Headline", { exact: true }).value).toBe("Keep my draft");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true));
  expect(JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH")[1].body).expectedVersion).toBe(2);
});

it("refreshes an approved photo in both portraits while preserving unsaved text when other saved fields are unchanged", async () => {
  const profile = ownerProfile(); profile.photoReview.pending = pending;
  const { user } = mountOwner(profile, async () => response({}));
  await screen.findByRole("img", { name: "Verified identity" }); await keepHeadline(user);
  profile.version++; profile.photo = { id: "candidate-photo" }; profile.photoReview = { required: true, pending: null, latestDecision: { ...pending, state: "APPROVED" } };
  await user.click(screen.getByRole("button", { name: "Refresh photo review" }));
  await screen.findByText("Your replacement photo was approved.");
  expect(screen.getByRole("button", { name: "Open account menu" }).querySelector("img").getAttribute("src")).toBe("/api/v1/photos/candidate-photo");
  await user.click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  expect(screen.getByLabelText("Headline", { exact: true }).value).toBe("Keep my draft");
});

it("does not overwrite other changed saved fields or discard drafts during photo refresh", async () => {
  const profile = ownerProfile(); profile.photoReview.pending = pending;
  const { user } = mountOwner(profile, async () => response({}));
  await screen.findByRole("img", { name: "Verified identity" }); await keepHeadline(user);
  profile.version++; profile.headline = "Changed in another session"; profile.photo = { id: "candidate-photo" };
  await user.click(screen.getByRole("button", { name: "Refresh photo review" }));
  await screen.findByText(/Other saved profile information changed/); expectOldPortrait();
  await user.click(screen.getByRole("button", { name: "Resume editing" }));
  expect(screen.getByLabelText("Headline", { exact: true }).value).toBe("Keep my draft");
});

function Reviewer({ id = "reviewer" }) { return <MemoryRouter><AuthContext.Provider value={{ account: { id } }}><ProfilePhotoReviewsPage /></AuthContext.Provider></MemoryRouter>; }
function mountReviewer({ decisionStatus = 200 } = {}) {
  let state = "PENDING", version = 1, allowed = true;
  const fetchMock = vi.fn(async (url) => {
    if (!allowed) return response("Identity reviewer access revoked.", 403);
    if (url.endsWith("/assign")) { state = "IN_REVIEW"; version++; return response({}); }
    if (url.endsWith("/decision")) { if (decisionStatus !== 200) return response("Review version changed.", decisionStatus); state = "APPROVED"; return response({}); }
    if (url.includes("/images/")) return new Response("image", { status: 200, headers: { "Content-Type": "image/webp" } });
    if (url.endsWith(requestId)) return response({ id: requestId, version, state, username: "applicant", reviewerId: state === "PENDING" ? null : "reviewer", profileVersion: 7, stale: false, imagesAvailable: state === "IN_REVIEW" });
    return response({ requests: state === "APPROVED" ? [] : [{ id: requestId, state, createdAt: "2026-10-25" }], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetchMock); const mounted = render(<Reviewer />);
  return { user: userEvent.setup(), fetchMock, revoke() { allowed = false; }, ...mounted };
}
async function openAssigned(user) {
  await user.click(await screen.findByRole("button", { name: /^Photo request 11111111/ }));
  await user.click(screen.getByRole("button", { name: "Assign photo review to me" }));
  return screen.findByLabelText("Photo decision");
}
it("requires assignment before private images load and binds one decision to the exact review and profile versions", async () => {
  const { user, fetchMock } = mountReviewer();
  await user.click(await screen.findByRole("button", { name: /^Photo request 11111111/ }));
  expect(fetchMock.mock.calls.some(([url]) => url.includes("/images/"))).toBe(false);
  await user.click(screen.getByRole("button", { name: "Assign photo review to me" }));
  await screen.findByLabelText("Photo decision");
  expect(screen.getByRole("button", { name: /^Photo request 11111111/ }).textContent).toContain("In review");
  expect(screen.getByAltText("Current approved profile portrait")).toBeTruthy();
  expect(screen.getByAltText("Private replacement profile portrait")).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Photo decision"), "APPROVED");
  await user.type(screen.getByLabelText("Feedback shown to the user"), "The clear replacement matches the existing portrait.");
  const form = screen.getByLabelText("Photo decision").closest("form"); fireEvent.submit(form); fireEvent.submit(form);
  await screen.findByText("Photo review decision saved.");
  const requests = fetchMock.mock.calls.filter(([url]) => url.endsWith("/decision")); expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0][1].body)).toMatchObject({ expectedVersion: 2, expectedProfileVersion: 7, decision: "APPROVED" });
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it("keeps feedback after a conflict and requires explicit reload rather than silently retrying", async () => {
  const { user, fetchMock } = mountReviewer({ decisionStatus: 409 }); await openAssigned(user);
  await user.type(screen.getByLabelText("Feedback shown to the user"), "Please upload a clearer portrait of yourself.");
  await user.click(screen.getByRole("button", { name: "Save photo decision" })); await screen.findByRole("alert");
  expect(screen.queryByLabelText("Photo decision")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reload photo reviews" }));
  expect((await screen.findByLabelText("Feedback shown to the user")).value).toBe("Please upload a clearer portrait of yourself.");
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/decision"))).toHaveLength(1);
});
it("clears private comparison images and decision controls when reviewer access is revoked on focus", async () => {
  const { user, revoke } = mountReviewer(); await openAssigned(user); revoke();
  act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert");
  expect(screen.queryByAltText("Private replacement profile portrait")).toBeNull();
  expect(screen.queryByLabelText("Photo decision")).toBeNull();
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2));
});
it("ignores a previous reviewer's delayed private detail after the signed-in account changes", async () => {
  let release, nextAccount = false;
  const late = new Promise((resolve) => { release = resolve; });
  const fetchMock = vi.fn(async (url) => {
    if (nextAccount) return response("No reviewer permission.", 403);
    if (url.endsWith(requestId)) return late;
    return response({ requests: [{ id: requestId, state: "IN_REVIEW", createdAt: "2026-10-25" }], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetchMock); const user = userEvent.setup(); const { rerender } = render(<Reviewer id="first" />);
  await user.click(await screen.findByRole("button", { name: /^Photo request/ }));
  nextAccount = true; rerender(<Reviewer id="second" />); await screen.findByRole("alert");
  await act(async () => release(response({ id: requestId, username: "private-applicant", state: "IN_REVIEW", reviewerId: "first", imagesAvailable: true })));
  expect(screen.queryByText(/private-applicant/)).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => url.includes("/images/"))).toBe(false);
});

it("uses the approved identity response to explain photo review even when the profile cache predates first verification", async () => {
  const profile = ownerProfile(); profile.photoReview.required = false;
  const { user } = mountOwner(profile, async () => response({}));
  await screen.findByRole("img", { name: "Verified identity" });
  expect(screen.getByRole("heading", { name: "Profile photo review" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Change profile picture" }));
  expect(screen.getByRole("button", { name: "Submit photo for review" })).toBeTruthy();
});
