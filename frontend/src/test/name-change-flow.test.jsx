import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../auth/auth-context";
import NameChangePage from "../pages/NameChangePage";
import NameChangeReviewsPage from "../pages/NameChangeReviewsPage";

const id = "11111111-1111-4111-8111-111111111111";
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
const original = { firstName: "Saved", middleName: null, lastName: "Owner" }, proposed = { firstName: "Corrected", middleName: "New", lastName: "Owner" };
const ownerData = extra => ({ currentName: original, identityRevision: 2, profileVersion: 7, identityVerified: true, canRequest: true, consentVersion: "manual-name-change-review-v1", retentionDays: 30, requests: [], ...extra });
const assets = [{ id: "government-id", kind: "GOVERNMENT_ID", expiresAt: "2026-10-27T12:00:00Z" }, { id: "selfie", kind: "SELFIE", expiresAt: "2026-10-27T12:00:00Z" }];
beforeEach(() => {
  const OriginalURL = URL;
  vi.stubGlobal("URL", class extends OriginalURL { static createObjectURL = vi.fn(() => "blob:private-image"); static revokeObjectURL = vi.fn(); });
});
function renderPage(Page, actor, refresh = vi.fn()) {
  return <MemoryRouter><AuthContext.Provider value={{ account: { id: actor }, refresh }}><Page /></AuthContext.Provider></MemoryRouter>;
}
function mountOwner(handler, data = ownerData()) {
  const refresh = vi.fn(), fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/evidence")) return response(assets);
    return handler ? handler(url, options, data) : response(data);
  });
  vi.stubGlobal("fetch", fetchMock); render(renderPage(NameChangePage, "owner", refresh));
  return { user: userEvent.setup(), fetchMock, refresh, data };
}
async function fill(user) {
  fireEvent.change(await screen.findByLabelText("First name"), { target: { value: proposed.firstName } });
  fireEvent.change(screen.getByLabelText("Middle name (optional)"), { target: { value: proposed.middleName } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: proposed.lastName } });
  await user.type(screen.getByLabelText("Why does your name need correction?"), "My saved name has a spelling error.");
  await user.type(screen.getByLabelText("Current password"), " correct password ");
  await user.click(screen.getByRole("checkbox", { name: /I consent to private review/ }));
  await user.selectOptions(screen.getByLabelText("Uploaded Government-issued ID"), "government-id");
  await user.selectOptions(screen.getByLabelText("Uploaded Selfie"), "selfie");
}

it("only offers submission to eligible verified owners without an active request", async () => {
  mountOwner(null, ownerData({ canRequest: false, identityVerified: false }));
  await screen.findByText(/A currently verified identity is required/);
  expect(screen.queryByLabelText("First name")).toBeNull(); expect(screen.queryByRole("button", { name: "Submit name correction" })).toBeNull();
});

it("submits a strict owner request with fresh evidence, preserves the saved name, and blocks duplicate submissions", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = mountOwner(async (url, options, data) => options?.method === "POST" ? pending : response(data));
  await fill(f.user); const form = screen.getByLabelText("Current password").closest("form"); fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(f.fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Reload name-correction status" }).disabled).toBe(true);
  const call = f.fetchMock.mock.calls.find(([, o]) => o?.method === "POST"), body = JSON.parse(call[1].body);
  expect(body).toMatchObject({ expectedProfileVersion: 7, expectedIdentityRevision: 2, password: " correct password ", proposedName: proposed, governmentId: "government-id", selfie: "selfie", consentVersion: "manual-name-change-review-v1" });
  expect(Object.keys(body).sort()).toEqual(["expectedProfileVersion", "expectedIdentityRevision", "idempotencyKey", "password", "proposedName", "reason", "governmentId", "selfie", "consentVersion"].sort());
  expect(call[1].credentials).toBe("include");
  f.data.canRequest = false; f.data.requests = [{ id, version: 1, state: "SUBMITTED", proposedName: proposed }];
  release(response({ id })); await screen.findByRole("heading", { name: "SUBMITTED" });
  expect(screen.getByText("Saved Owner")).toBeTruthy(); expect(screen.queryByLabelText("Current password")).toBeNull();
});

it("wrong password retains proposed details and evidence choices but clears only the password", async () => {
  const f = mountOwner(async (url, options, data) => options?.method === "POST" ? response("Your current password is incorrect.", 400) : response(data));
  await fill(f.user); await f.user.click(screen.getByRole("button", { name: "Submit name correction" }));
  await screen.findByRole("alert"); expect(screen.getByLabelText("First name").value).toBe("Corrected"); expect(screen.getByLabelText("Current password").value).toBe("");
  expect(screen.getByLabelText("Uploaded Selfie").value).toBe("selfie");
});

it("an ambiguous delivery failure retries the same request instead of inventing a second submission", async () => {
  const f = mountOwner(async (url, options, data) => options?.method === "POST" ? response("Response unavailable.", 503) : response(data));
  await fill(f.user); await f.user.click(screen.getByRole("button", { name: "Submit name correction" })); await screen.findByRole("alert");
  await f.user.click(screen.getByRole("button", { name: "Retry same name-correction request" }));
  await waitFor(() => expect(f.fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(2));
  const bodies = f.fetchMock.mock.calls.filter(([, o]) => o?.method === "POST").map(([, o]) => o.body); expect(bodies[0]).toBe(bodies[1]);
});

it("stale responses preserve proposed names and require explicit reload before another submission", async () => {
  const f = mountOwner(async (url, options, data) => options?.method === "POST" ? response("Identity changed. Reload.", 409) : response(data));
  await fill(f.user); await f.user.click(screen.getByRole("button", { name: "Submit name correction" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("First name").value).toBe("Corrected"); expect(screen.getByRole("button", { name: "Submit name correction" }).disabled).toBe(true);
  expect(f.fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
});

function reviewerFixture() {
  let state = "SUBMITTED", version = 1, allowed = true;
  const fetchMock = vi.fn(async (url) => {
    if (!allowed) return response("Reviewer access revoked.", 403);
    if (url.endsWith("/assign")) { state = "IN_REVIEW"; version++; return response({}); }
    if (url.endsWith("/decision")) { state = "APPROVED"; return response({}); }
    if (url.includes("/evidence/") || url.endsWith("/portrait")) return new Response("image", { headers: { "Content-Type": "image/webp" } });
    if (url.endsWith(id)) return response({ id, version, state, username: "owner", reviewerId: state === "IN_REVIEW" ? "reviewer" : null, profileVersion: 7, stale: false, evidenceAvailable: state === "IN_REVIEW", previousName: state === "IN_REVIEW" ? original : null, proposedName: state === "IN_REVIEW" ? proposed : null, reason: "Saved spelling error.", evidence: state === "IN_REVIEW" ? assets : [] });
    return response({ requests: state === "APPROVED" ? [] : [{ id, state, version }], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetchMock); render(renderPage(NameChangeReviewsPage, "reviewer"));
  return { user: userEvent.setup(), fetchMock, revoke() { allowed = false; } };
}
async function assign(user) {
  await user.click(await screen.findByRole("button", { name: /Name request/ }));
  expect(screen.queryByRole("heading", { name: "Proposed name" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Assign name correction to me" }));
  await screen.findByAltText("Private Government-issued ID for name correction");
  await screen.findByRole("button", { name: "Save name decision" });
}

it("reviewers must assign and load both private images before submitting an explicit decision and reason", async () => {
  const f = reviewerFixture(); await assign(f.user);
  expect(screen.getByText("Corrected New Owner")).toBeTruthy(); expect(screen.getByRole("button", { name: "Save name decision" }).disabled).toBe(true);
  await f.user.selectOptions(screen.getByLabelText("Name decision"), "APPROVED");
  await f.user.type(screen.getByLabelText("Feedback shown to the owner"), "The fresh ID and selfie match the proposed name.");
  await f.user.click(screen.getByRole("checkbox", { name: "I compared the approved portrait, both documents and the proposed name." }));
  await f.user.click(screen.getByRole("button", { name: "Save name decision" })); await screen.findByText("Name-correction decision saved.");
  const requests = f.fetchMock.mock.calls.filter(([url]) => url.endsWith("/decision")); expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0][1].body)).toMatchObject({ expectedVersion: 2, expectedProfileVersion: 7, decision: "APPROVED" });
});

it("revocation on focus clears private names, evidence, feedback and decision controls", async () => {
  const f = reviewerFixture(); await assign(f.user); await f.user.type(screen.getByLabelText("Feedback shown to the owner"), "Sensitive draft feedback");
  f.revoke(); act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert");
  expect(screen.queryByText("Corrected New Owner")).toBeNull(); expect(screen.queryByAltText("Private Selfie for name correction")).toBeNull(); expect(screen.queryByLabelText("Feedback shown to the owner")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});

it("an owner switch ignores the previous account's late private response", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); let calls = 0;
  vi.stubGlobal("fetch", vi.fn(async url => url.endsWith("/evidence") ? response([]) : ++calls === 1 ? pending : response(ownerData({ currentName: { firstName: "Second", middleName: null, lastName: "Owner" }, canRequest: false }))));
  const view = render(renderPage(NameChangePage, "first")); view.rerender(renderPage(NameChangePage, "second"));
  await screen.findByText("Second Owner"); await act(async () => { release(response(ownerData())); });
  expect(screen.queryByText("Saved Owner")).toBeNull(); expect(screen.queryByLabelText("Current password")).toBeNull();
});
