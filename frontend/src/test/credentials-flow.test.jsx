import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";
import { rebaseCredentialProfile } from "../pages/credential-form";
import { createProfileDraft, formFromProfile } from "../pages/profile-form";
const id = "11111111-1111-4111-8111-111111111111";
const record = { id, revision: 1, status: "DRAFT", institution: "School", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" };
const profile = { version: 1, education: { mode: "RECORDS", records: [record] }, experience: { mode: "NONE", records: [] }, location: {}, skills: [], interests: [] };
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
function mount(path, handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/auth/me")) return response({ account: { id: "owner", username: "tester", person: { firstName: "Test", lastName: "User" } } });
    if (url.endsWith("/profile/me")) return response({ profile });
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return { fetchMock, user: userEvent.setup() };
}
it("submits the saved revision with private evidence and blocks duplicate final submission", async () => {
  let submitted = false, release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { user, fetchMock } = mount(`/credentials/education/${id}`, async (url) => {
    if (url.endsWith("/evidence")) return response({ id: "asset", contentType: "application/pdf", size: 10 });
    if (url.endsWith("/submit")) { submitted = true; return pending; }
    return response({ record: { ...record, status: submitted ? "SUBMITTED" : "DRAFT" }, profileVersion: submitted ? 2 : 1, review: null });
  });
  await screen.findByRole("heading", { name: "Diploma" });
  await user.click(screen.getByLabelText(/My issuer is not listed/));
  await user.upload(screen.getByLabelText("Supporting documents"), new File(["pdf"], "proof.pdf", { type: "application/pdf" }));
  const form = screen.getByLabelText("Supporting documents").closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/submit"))).toHaveLength(1));
  const options = fetchMock.mock.calls.find(([url]) => url.endsWith("/submit"))[1];
  expect(JSON.parse(options.body)).toEqual({ expectedVersion: 1, revision: 1, evidenceIds: ["asset"], issuerOrganizationId: null });
  expect(fetchMock.mock.calls.find(([url]) => url.endsWith("/evidence"))[1].credentials).toBe("include");
  release(response({ profile: { ...profile, version: 2, education: { mode: "RECORDS", records: [{ ...record, status: "SUBMITTED" }] } } }));
  await screen.findByText("Status: Submitted");
  expect(screen.queryByRole("button", { name: "Submit for verification" })).toBeNull();
});
it("retains selected documents after failed submission and does not silently retry a conflict", async () => {
  const { user, fetchMock } = mount(`/credentials/education/${id}`, async (url) => {
    if (url.endsWith("/evidence")) return response({ id: "asset" });
    if (url.endsWith("/submit")) return response("This record changed. Reload it.", 409);
    return response({ record, profileVersion: 1, review: null });
  });
  await screen.findByRole("heading", { name: "Diploma" });
  await user.click(screen.getByLabelText(/My issuer is not listed/));
  await user.upload(screen.getByLabelText("Supporting documents"), new File(["pdf"], "keep.pdf", { type: "application/pdf" }));
  await user.click(screen.getByRole("button", { name: "Submit for verification" }));
  expect((await screen.findByRole("alert")).textContent).toContain("record changed");
  expect(screen.getByText("keep.pdf")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Submit for verification" }).disabled).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/submit"))).toHaveLength(1);
});
it("rejects reviewer access before showing the queue or decision controls", async () => {
  mount("/admin/credentials", async () => response("Reviewer access is required.", 403));
  expect((await screen.findByRole("alert")).textContent).toContain("Reviewer access");
  expect(screen.queryByLabelText("Decision")).toBeNull();
});
it("keeps unsaved profile sections while rebasing the submitted history status and version", () => {
  const draft = createProfileDraft(profile); draft.form.bio = "Unsaved introduction";
  const next = { ...profile, version: 2, education: { mode: "RECORDS", records: [{ ...record, status: "SUBMITTED" }] } };
  const rebased = rebaseCredentialProfile(draft, next);
  expect(rebased.profile.version).toBe(2);
  expect(rebased.form.bio).toBe("Unsaved introduction");
  expect(rebased.form.educationRecords).toBe(formFromProfile(next).educationRecords);
  expect(rebaseCredentialProfile(rebased, profile)).toBe(rebased);
});
it("requires assignment before enabling the reviewer decision form and submits an explicit reason", async () => {
  let status = "SUBMITTED", version = 1;
  const review = () => ({ id, revision: 1, version, status, reviewerId: status === "SUBMITTED" ? null : "owner", initialSubmittedAt: "2026-10-18", targetAt: "2026-10-25", deadlineAt: "2026-11-01", attempts: [{ id: "attempt", revision: 1, status, createdAt: "2026-10-18", snapshot: { institution: "School" }, evidence: [] }], events: [] });
  const { user, fetchMock } = mount("/admin/credentials", async (url) => {
    if (url.endsWith("/assign")) { status = "IN_REVIEW"; version++; return response({ id, status }); }
    if (url.endsWith("/decision")) { status = "VERIFIED"; version++; return response({ id, status }); }
    if (url.endsWith(`/admin/credentials/${id}`)) return response({ review: review(), username: "learner" });
    return response({ reviews: [{ ...review(), kind: "education", profile: { person: { firstName: "Learner", lastName: "User" } } }], nextCursor: null });
  });
  await user.click(await screen.findByRole("button", { name: /Learner User/ }));
  expect(screen.queryByLabelText("Decision")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Assign to me and start review" }));
  await screen.findByLabelText("Decision");
  await user.selectOptions(screen.getByLabelText("Decision"), "VERIFIED");
  await user.type(screen.getByLabelText("Reason shown to the user"), "Institution confirmed this certificate.");
  await user.click(screen.getByRole("button", { name: "Save review decision" }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/decision"))).toHaveLength(1));
  expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/decision"))[1].body)).toEqual({ expectedVersion: 2, revision: 1, status: "VERIFIED", note: "Institution confirmed this certificate." });
});


it("shows false-credential feedback in private review history after the record leaves profile display", async () => {
  mount("/credentials", async () => response({ reviews: [{ id, kind: "education", recordId: id, status: "FALSE_CREDENTIAL", note: "The institution could not authenticate this document.", attempts: [{ snapshot: { qualification: "Diploma" } }] }], nextCursor: null }));
  const link = await screen.findByRole("link", { name: "Diploma · False credential" });
  expect(link.getAttribute("href")).toBe(`/credentials/education/${id}`);
  expect(screen.getByText("The institution could not authenticate this document.")).toBeTruthy();
});


it("blocks credential submission when the loaded record belongs to a newer profile version", async () => {
  const { fetchMock } = mount(`/credentials/education/${id}`, async () => response({ record, profileVersion: 2, review: null }));
  await screen.findByRole("heading", { name: "Diploma" });
  expect((await screen.findByRole("alert")).textContent).toContain("saved profile changed");
  expect(screen.getByLabelText("Supporting documents").matches(":disabled")).toBe(true);
  fireEvent.submit(screen.getByLabelText("Supporting documents").closest("form"));
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/submit"))).toBe(false);
});
