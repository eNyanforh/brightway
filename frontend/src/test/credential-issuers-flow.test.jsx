import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";
const id = "11111111-1111-4111-8111-111111111111", org = "22222222-2222-4222-8222-222222222222";
const record = { id, revision: 1, status: "DRAFT", institution: "Listed School", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" };
const profile = { version: 1, education: { mode: "RECORDS", records: [record] }, experience: { mode: "NONE", records: [] }, location: {}, skills: [], interests: [] };
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
function mount(path, handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/auth/me")) return response({ account: { id: "reviewer", username: "tester", person: { firstName: "Test", lastName: "User" } } });
    if (url.endsWith("/profile/me")) return response({ profile });
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return { fetchMock, user: userEvent.setup() };
}
const upload = user => user.upload(screen.getByLabelText("Supporting documents"), new File(["pdf"], "proof.pdf", { type: "application/pdf" }));
it("requires an explicit issuer choice before uploading or submitting evidence", async () => {
  const { user, fetchMock } = mount(`/credentials/education/${id}`, async () => response({ record, profileVersion: 1, review: null }));
  await screen.findByRole("heading", { name: "Diploma" }); await upload(user);
  await user.click(screen.getByRole("button", { name: "Submit for verification" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Choose the issuer");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/evidence") || url.endsWith("/submit"))).toBe(false);
});
it("searches public issuer details and submits the selected organization ID with the saved claim", async () => {
  let submitted = false;
  const { user, fetchMock } = mount(`/credentials/education/${id}`, async url => {
    if (url.includes("/credentials/issuers?")) return response({ organizations: [{ id: org, name: "Listed School", locations: [{ city: "Monrovia", countryCode: "LR" }] }], refineSearch: false });
    if (url.endsWith("/evidence")) return response({ id: "asset" });
    if (url.endsWith("/submit")) { submitted = true; return response({ profile: { ...profile, version: 2 } }); }
    return response({ record: { ...record, status: submitted ? "SUBMITTED" : "DRAFT" }, profileVersion: submitted ? 2 : 1, review: null });
  });
  await screen.findByRole("heading", { name: "Diploma" });
  await user.type(screen.getByLabelText("Find school or organization"), "Listed"); await user.click(screen.getByRole("button", { name: "Search issuers" }));
  await user.click(await screen.findByRole("radio", { name: /Listed School.*Monrovia/ })); await upload(user);
  await user.click(screen.getByRole("button", { name: "Submit for verification" })); await screen.findByText("Status: Submitted");
  const request = fetchMock.mock.calls.find(([url]) => url.endsWith("/submit"));
  expect(JSON.parse(request[1].body)).toEqual({ expectedVersion: 1, revision: 1, evidenceIds: ["asset"], issuerOrganizationId: org });
  expect(fetchMock.mock.calls.find(([url]) => url.includes("/credentials/issuers?"))[1].credentials).toBe("include");
});
it("a failed directory search preserves the selected files and never claims successful verification", async () => {
  const { user } = mount(`/credentials/education/${id}`, async url => url.includes("/credentials/issuers?") ? response("Directory unavailable", 503) : response({ record, profileVersion: 1, review: null }));
  await screen.findByRole("heading", { name: "Diploma" }); await upload(user);
  await user.type(screen.getByLabelText("Find school or organization"), "School"); await user.click(screen.getByRole("button", { name: "Search issuers" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Directory unavailable"); expect(screen.getByText("proof.pdf")).toBeTruthy(); expect(screen.getByText("Status: Not submitted")).toBeTruthy();
});
function review(status = "SUBMITTED", version = 1) { return { id, kind: "education", revision: 1, version, status, reviewerId: status === "SUBMITTED" ? null : "reviewer", issuerOrganizationId: org, issuerName: "Listed School", initialSubmittedAt: "2026-10-18", targetAt: "2026-10-25", deadlineAt: "2026-11-01", attempts: [{ id: "attempt", revision: 1, status, createdAt: "2026-10-18", snapshot: { institution: "Listed School" }, evidence: [] }], events: [] }; }
const queue = item => ({ organization: { id: org, name: "Listed School" }, reviews: [{ ...item, profile: { person: { firstName: "Learner", lastName: "User" } } }], nextCursor: null });
it("organization decisions use only scoped endpoints and require assignment and explicit feedback", async () => {
  let current = review();
  const { user, fetchMock } = mount(`/organization-workspace/${org}/credentials`, async url => {
    if (url.endsWith("/assign")) { current = review("IN_REVIEW", 2); return response({ id }); }
    if (url.endsWith("/decision")) { current = review("VERIFIED", 3); return response({ id }); }
    if (url.endsWith(`/${id}`)) return response({ review: current, username: "learner" });
    return response(queue(current));
  });
  await user.click(await screen.findByRole("button", { name: /Learner User/ })); expect(screen.queryByLabelText("Decision")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Assign to me and start review" })); await screen.findByLabelText("Decision");
  await user.selectOptions(screen.getByLabelText("Decision"), "VERIFIED"); await user.type(screen.getByLabelText("Reason shown to the user"), "The school confirmed this saved credential.");
  await user.click(screen.getByRole("button", { name: "Save review decision" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/decision"))).toBe(true));
  expect(fetchMock.mock.calls.filter(([url]) => url.includes("/admin/credentials"))).toHaveLength(0);
  expect(fetchMock.mock.calls.find(([url]) => url.endsWith("/decision"))[0]).toBe(`/api/v1/organization-workspace/${org}/credential-reviews/${id}/decision`);
});
it("permission withdrawal on focus clears the private review, applicant name and decision reason", async () => {
  let revoked = false;
  const { user } = mount(`/organization-workspace/${org}/credentials`, async url => revoked ? response("Credential permission withdrawn", 403) : response(url.endsWith(`/${id}`) ? { review: review("IN_REVIEW", 2), username: "learner" } : queue(review("IN_REVIEW", 2))));
  await user.click(await screen.findByRole("button", { name: /Learner User/ })); await user.type(screen.getByLabelText("Reason shown to the user"), "Private unfinished reason");
  revoked = true; fireEvent(window, new Event("focus")); await screen.findByRole("alert");
  expect(screen.queryByText("Review for @learner")).toBeNull(); expect(screen.queryByDisplayValue("Private unfinished reason")).toBeNull(); expect(screen.queryByLabelText("Decision")).toBeNull();
});
it("stale focus refresh preserves the written reason but blocks a decision until explicit reload", async () => {
  let changed = false;
  const { user } = mount(`/organization-workspace/${org}/credentials`, async url => response(url.endsWith(`/${id}`) ? { review: review("IN_REVIEW", changed ? 3 : 2), username: "learner" } : queue(review("IN_REVIEW", 2))));
  await user.click(await screen.findByRole("button", { name: /Learner User/ })); await user.type(screen.getByLabelText("Reason shown to the user"), "Keep this unfinished decision reason");
  changed = true; await act(async () => fireEvent(window, new Event("focus"))); await screen.findByRole("alert");
  expect(screen.getByLabelText("Reason shown to the user").value).toContain("Keep this"); expect(screen.getByRole("button", { name: "Save review decision" }).disabled).toBe(true);
});
it("withdrawn assignments expose recovery only when the server authorizes reassignment", async () => {
  const { user, fetchMock } = mount(`/organization-workspace/${org}/credentials`, async url => response(url.endsWith(`/${id}`) ? { review: { ...review("IN_REVIEW", 2), reviewerId: "revoked" }, username: "learner", canReassign: true } : queue(review("IN_REVIEW", 2))));
  await user.click(await screen.findByRole("button", { name: /Learner User/ }));
  await user.click(screen.getByRole("button", { name: "Reassign withdrawn review to me" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/assign"))).toBe(true));
  expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/assign"))[1].body)).toEqual({ expectedVersion: 2 });
});
