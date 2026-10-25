import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../auth/auth-context";
import ManualIdentityPage from "../pages/ManualIdentityPage";
import ManualIdentityReviewsPage from "../pages/ManualIdentityReviewsPage";
import { manualIdentityApi } from "../api/manual-identity";
const requestId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const governmentId = "33333333-3333-4333-8333-333333333333";
const selfie = "44444444-4444-4444-8444-444444444444";
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
const assets = [{ id: governmentId, kind: "GOVERNMENT_ID", expiresAt: "2026-10-27" }, { id: selfie, kind: "SELFIE", expiresAt: "2026-10-27" }];
function owner(overrides = {}) { return { request: null, status: "NOT_STARTED", identityVerified: false, eligibility: { requirementsMet: true, checks: [{ code: "PROFILE_COMPLETE_REQUIRED", label: "100% complete profile", satisfied: true }, { code: "VERIFIED_EDUCATION_REQUIRED", label: "At least one verified education record", satisfied: true }, { code: "VERIFIED_EXPERIENCE_REQUIRED", label: "At least one verified experience record", satisfied: true }] }, identityDetailsComplete: true, submissionConfigured: true, canSubmit: true, consentVersion: "manual-identity-review-v1", retentionDays: 30, workingDays: "Monday–Friday", attempts: [], ...overrides }; }
function mount(Component, handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/profile/me")) return response({ profile: { version: 7 } });
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><AuthContext.Provider value={{ account: { id: "reviewer" } }}><Component /></AuthContext.Provider></MemoryRouter>);
  return { user: userEvent.setup(), fetchMock };
}
async function choose(user) {
  await user.click(await screen.findByRole("checkbox"));
  await user.selectOptions(screen.getByLabelText("Uploaded Government-issued ID"), governmentId);
  await user.selectOptions(screen.getByLabelText("Uploaded Selfie"), selfie);
}
it("shows missing prerequisites and does not offer an upload or submission", async () => {
  mount(ManualIdentityPage, async (url) => response(url.endsWith("/evidence") ? [] : owner({ canSubmit: false, eligibility: { requirementsMet: false, checks: [{ code: "EDUCATION", label: "At least one verified education record", satisfied: false }] } })));
  await screen.findByText("Still needed — At least one verified education record");
  expect(screen.queryByLabelText("Choose Selfie")).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit identity request" })).toBeNull();
});
it("requires explicit consent and retains the selected local file after failed private storage", async () => {
  const { user, fetchMock } = mount(ManualIdentityPage, async (url, options) => response(options?.method === "POST" ? "Storage temporarily unavailable." : url.endsWith("/evidence") ? [] : owner(), options?.method === "POST" ? 503 : 200));
  const input = await screen.findByLabelText("Choose Selfie"); expect(input.matches(":disabled")).toBe(true);
  await user.click(screen.getByRole("checkbox"));
  const file = new File(["image"], "keep-selfie.png", { type: "image/png" }); await user.upload(input, file);
  await user.click(screen.getByRole("button", { name: "Upload Selfie" }));
  await screen.findByRole("alert"); expect(input.files[0]).toBe(file); expect(screen.getByText("Selected: keep-selfie.png")).toBeTruthy();
  const options = fetchMock.mock.calls.find(([url]) => url.endsWith("/evidence/SELFIE"))[1];
  expect(options.headers["X-Identity-Consent"]).toBe("manual-identity-upload-v1"); expect(options.credentials).toBe("include"); expect(options.body).toBe(file);
});
it("validates image size locally before making an upload request", async () => {
  const { user, fetchMock } = mount(ManualIdentityPage, async (url) => response(url.endsWith("/evidence") ? [] : owner()));
  await user.click(await screen.findByRole("checkbox"));
  await user.upload(screen.getByLabelText("Choose Selfie"), new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "Upload Selfie" })); await screen.findByRole("alert");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/evidence/SELFIE"))).toBe(false);
});
it("submits the fresh saved profile version once and does not grant verification on submission", async () => {
  let submitted = false, release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { user, fetchMock } = mount(ManualIdentityPage, async (url) => {
    if (url.endsWith("/submit")) { submitted = true; return pending; }
    return response(url.endsWith("/evidence") ? assets : owner(submitted ? { status: "SUBMITTED", canSubmit: false } : {}));
  });
  await choose(user); const form = screen.getByRole("button", { name: "Submit identity request" }).closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/submit"))).toHaveLength(1));
  const options = fetchMock.mock.calls.find(([url]) => url.endsWith("/submit"))[1];
  expect(JSON.parse(options.body)).toMatchObject({ expectedVersion: 0, expectedProfileVersion: 7, governmentId, selfie, consentVersion: "manual-identity-review-v1" });
  expect(JSON.parse(options.body).idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  release(response({ attemptId })); await screen.findByText("Submitted", { selector: "strong" });
  expect(screen.queryByText("BrightWay has verified your identity.")).toBeNull();
});
it("reuses exactly the same request after an uncertain network response", async () => {
  const { user, fetchMock } = mount(ManualIdentityPage, async (url) => {
    if (url.endsWith("/submit")) throw new TypeError("offline");
    return response(url.endsWith("/evidence") ? assets : owner());
  });
  await choose(user); await user.click(screen.getByRole("button", { name: "Submit identity request" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("Uploaded Selfie").matches(":disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Retry same identity request" })); await screen.findByRole("alert");
  const calls = fetchMock.mock.calls.filter(([url]) => url.endsWith("/submit")); expect(calls).toHaveLength(2); expect(calls[0][1].body).toBe(calls[1][1].body);
});
it("requires an explicit status reload after a stale submission instead of silently retrying", async () => {
  const { user, fetchMock } = mount(ManualIdentityPage, async (url) => response(url.endsWith("/submit") ? "Saved profile changed." : url.endsWith("/evidence") ? assets : owner(), url.endsWith("/submit") ? 409 : 200));
  await choose(user); await user.click(screen.getByRole("button", { name: "Submit identity request" })); await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Retry same identity request" }).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Reload review status" })); await waitFor(() => expect(screen.getByRole("button", { name: "Submit identity request" }).disabled).toBe(false));
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/submit"))).toHaveLength(1);
});
it("does not resubmit a confirmed request when the follow-up status refresh fails", async () => {
  let submitted = false;
  const { user, fetchMock } = mount(ManualIdentityPage, async (url) => {
    if (url.endsWith("/submit")) { submitted = true; return response({ attemptId }); }
    if (submitted && !url.endsWith("/evidence")) return response("Status refresh unavailable.", 503);
    return response(url.endsWith("/evidence") ? assets : owner());
  });
  await choose(user); await user.click(screen.getByRole("button", { name: "Submit identity request" })); await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Submit identity request" }).disabled).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/submit"))).toHaveLength(1);
});
it("shows correction feedback and an invalidated effective status without claiming approval", async () => {
  mount(ManualIdentityPage, async (url) => response(url.endsWith("/evidence") ? [] : owner({ status: "INVALIDATED", attempts: [{ id: attemptId, revision: 1, state: "APPROVED", note: "An earlier approval was recorded.", evidence: [], snapshot: null, purgeAt: "2026-11-25" }] })));
  await screen.findByText("New verification required", { selector: "strong" });
  expect(screen.queryByText("BrightWay has verified your identity.")).toBeNull(); expect(screen.getByText("An earlier approval was recorded.")).toBeTruthy();
});
function reviewerHandler({ decisionStatus = 200 } = {}) {
  let state = "SUBMITTED", version = 1;
  return async (url) => {
    if (url.endsWith("/access")) return response({ allowed: true });
    if (url.endsWith("/assign")) { state = "IN_REVIEW"; version++; return response({ id: requestId }); }
    if (url.endsWith("/decision")) { if (decisionStatus !== 200) return response("Review changed or access revoked.", decisionStatus); state = "APPROVED"; version++; return response({ status: state }); }
    if (url.endsWith(`/manual-identity/${requestId}`)) return response(owner({ username: "learner", request: { id: requestId, version, currentAttemptId: attemptId, targetAt: "2026-10-30" }, status: state, attempts: [{ id: attemptId, revision: 1, state, reviewerId: state === "SUBMITTED" ? null : "reviewer", snapshot: state === "SUBMITTED" ? null : { firstName: "Learner" }, evidence: [], purgeAt: "2026-11-30" }] }));
    return response({ requests: [{ id: requestId, state, targetAt: "2026-10-30" }], nextCursor: null });
  };
}
async function openReview(user) {
  await user.click(await screen.findByRole("button", { name: /^Request 11111111/ }));
}
it("does not fetch the review queue or expose decision controls when privileged access is denied", async () => {
  const { fetchMock } = mount(ManualIdentityReviewsPage, async () => response("Two-factor authentication is required.", 403));
  await screen.findByRole("alert"); expect(screen.queryByLabelText("Identity decision")).toBeNull();
  expect(fetchMock.mock.calls).toHaveLength(1); expect(screen.getByRole("link", { name: "Open Account security" })).toBeTruthy();
});
it("requires assignment, hides the snapshot before assignment and binds the exact attempt/version to the decision", async () => {
  const { user, fetchMock } = mount(ManualIdentityReviewsPage, reviewerHandler()); await openReview(user);
  expect(screen.queryByText("Learner", { selector: "dd" })).toBeNull(); expect(screen.queryByLabelText("Identity decision")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Assign to me and start identity review" }));
  await screen.findByLabelText("Identity decision"); expect(screen.getByText("Learner", { selector: "dd" })).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Identity decision"), "APPROVED"); await user.type(screen.getByLabelText("Feedback shown to the user"), "ID and selfie match the saved identity.");
  const form = screen.getByLabelText("Identity decision").closest("form"); fireEvent.submit(form); fireEvent.submit(form);
  await screen.findByText("Identity review decision saved.");
  const calls = fetchMock.mock.calls.filter(([url]) => url.endsWith("/decision")); expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body)).toEqual({ expectedVersion: 2, attemptId, status: "APPROVED", note: "ID and selfie match the saved identity." });
});
it("preserves feedback after a stale decision and requires reload before an explicit retry", async () => {
  const { user, fetchMock } = mount(ManualIdentityReviewsPage, reviewerHandler({ decisionStatus: 409 })); await openReview(user);
  await user.click(screen.getByRole("button", { name: "Assign to me and start identity review" }));
  await user.type(await screen.findByLabelText("Feedback shown to the user"), "Please send a clearer government ID."); await user.click(screen.getByRole("button", { name: "Save identity decision" })); await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Save identity decision" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reload identity reviews" }));
  expect((await screen.findByLabelText("Feedback shown to the user")).value).toBe("Please send a clearer government ID.");
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/decision"))).toHaveLength(1);
});
it("clears private review details if access is revoked during a decision", async () => {
  const { user } = mount(ManualIdentityReviewsPage, reviewerHandler({ decisionStatus: 403 })); await openReview(user);
  await user.click(screen.getByRole("button", { name: "Assign to me and start identity review" }));
  await user.type(await screen.findByLabelText("Feedback shown to the user"), "A sufficiently clear review reason."); await user.click(screen.getByRole("button", { name: "Save identity decision" })); await screen.findByRole("alert");
  expect(screen.queryByText("Learner", { selector: "dd" })).toBeNull(); expect(screen.queryByLabelText("Identity decision")).toBeNull();
});
it("uses the authenticated attached-document route and releases its temporary download URL", async () => {
  const fetchMock = vi.fn(async () => new Response("image", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
  const createObjectURL = vi.fn(() => "blob:private"), revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL }); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); vi.useFakeTimers();
  try {
    await manualIdentityApi.download(governmentId);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/manual-identity/documents/${governmentId}/download`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
    vi.runAllTimers(); expect(revokeObjectURL).toHaveBeenCalledWith("blob:private");
  } finally { vi.useRealTimers(); }
});

it("hides uploads and the submit action on a direct identity URL when a prerequisite is missing despite canSubmit being true", async () => {
  const data = owner(); data.eligibility.checks[2].satisfied = false;
  mount(ManualIdentityPage, async (url) => response(url.endsWith("/evidence") ? assets : data));
  await screen.findByText("Still needed — At least one verified experience record");
  expect(screen.queryByLabelText("Choose Selfie")).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit identity request" })).toBeNull();
});
