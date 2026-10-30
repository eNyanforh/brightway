import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import { credentialsApi } from "../api/credentials";
import CredentialReviewsPage from "../pages/CredentialReviewsPage";
const org = "22222222-2222-4222-8222-222222222222", first = "11111111-1111-4111-8111-111111111111", second = "33333333-3333-4333-8333-333333333333";
const path = `/organization-workspace/${org}/credentials`, endpoint = `/api/v1/organization-workspace/${org}/credential-reviews`;
const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } });
function review(id = first, status = "IN_REVIEW", version = 2) {
  return { id, kind: "education", issuerOrganizationId: org, issuerName: "Bright Future School", version, revision: 1, status, reviewerId: status === "SUBMITTED" ? null : "reviewer", initialSubmittedAt: "2026-10-18T12:00:00Z", targetAt: "2026-10-25T12:00:00Z", overdue: true,
    profile: { person: { firstName: id === first ? "Grace" : "Sarah", lastName: id === first ? "Johnson" : "Kamara", account: { username: id === first ? "grace" : "sarah" } } },
    attempts: [{ id: `attempt-${id}`, revision: 1, status, snapshot: { institution: "Bright Future School", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false }, evidence: [{ id: "asset", contentType: "application/pdf", size: 4096 }], createdAt: "2026-10-18T12:00:00Z" }], events: [] };
}
const queue = (reviews, nextCursor = null) => ({ organization: { id: org, name: "Bright Future School" }, reviews, nextCursor });
function mount(handler, suffix = "") {
  const fetch = vi.fn(handler), setActingOrganization = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<AuthContext.Provider value={{ account: { id: "reviewer", username: "reviewer" } }}><MemoryRouter initialEntries={[path + suffix]}><Routes><Route element={<Outlet context={{ setActingOrganization }} />}><Route path="/organization-workspace/:organizationId/credentials" element={<CredentialReviewsPage />} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
  return { fetch, setActingOrganization, user: userEvent.setup() };
}
const reads = (url, item = review()) => response(url.split("?")[0].endsWith(`/${first}`) ? { review: item, username: "grace" } : queue([item]));
it("shows a page-scoped queue, readable saved claim fields and assignment-protected document cards", async () => {
  const f = mount(url => reads(url, review(first, "SUBMITTED", 1)));
  await screen.findByRole("heading", { name: "Credential Review", level: 1 });
  await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ }));
  expect(screen.getByRole("heading", { name: "Grace Johnson", level: 2 })).toBeTruthy();
  expect(screen.getByText("September 2020")).toBeTruthy(); expect(screen.getByText("June 2023")).toBeTruthy(); expect(screen.queryByText("startMonth")).toBeNull();
  expect(screen.getByRole("button", { name: "Download supporting document 1" }).disabled).toBe(true);
  expect(screen.queryByLabelText("Decision")).toBeNull(); expect(screen.getByText("reviews on this page", { exact: false })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
});
it("searches only the loaded applicants and routes queue filters to the server", async () => {
  const f = mount(url => response(queue(url.includes("status=VERIFIED") ? [] : [review(), review(second)])));
  await screen.findByRole("button", { name: /Grace Johnson/ }); const before = f.fetch.mock.calls.length;
  await f.user.type(screen.getByLabelText("Search applicants on this page"), "Sarah");
  expect(screen.queryByRole("button", { name: /Grace Johnson/ })).toBeNull(); expect(screen.getByRole("button", { name: /Sarah Kamara/ })).toBeTruthy(); expect(f.fetch.mock.calls).toHaveLength(before);
  await f.user.selectOptions(screen.getByLabelText("Filter by review status"), "VERIFIED"); await screen.findByText("No credential submissions match this view.");
  expect(f.fetch.mock.calls.at(-1)[0]).toBe(endpoint + "?status=VERIFIED"); expect(screen.getByLabelText("Search applicants on this page").value).toBe("");
});
it("keeps server filters on forward/back pagination without claiming a global total", async () => {
  const f = mount(url => response(queue([review(url.includes("cursor=") ? second : first)], url.includes("cursor=") ? null : first)), "?filter=unassigned");
  await screen.findByRole("button", { name: /Grace Johnson/ }); await f.user.click(screen.getByRole("button", { name: "Next page" })); await screen.findByRole("button", { name: /Sarah Kamara/ });
  expect(f.fetch.mock.calls.at(-1)[0]).toBe(endpoint + `?filter=unassigned&cursor=${first}`);
  await f.user.click(screen.getByRole("button", { name: "Previous page" })); await screen.findByRole("button", { name: /Grace Johnson/ }); expect(f.fetch.mock.calls.at(-1)[0]).toBe(endpoint + "?filter=unassigned");
  expect(screen.getByRole("button", { name: "Previous page" }).disabled).toBe(true);
});
it("keeps a dirty decision when discard is declined and clears it only after an explicit review switch", async () => {
  const f = mount(url => response(url.endsWith(`/${first}`) ? { review: review(), username: "grace" } : url.endsWith(`/${second}`) ? { review: review(second), username: "sarah" } : queue([review(), review(second)])));
  await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ })); await f.user.type(screen.getByLabelText("Reason shown to the user"), "Unfinished careful decision");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); await f.user.click(screen.getByRole("button", { name: /Sarah Kamara/ }));
  expect(screen.getByLabelText("Reason shown to the user").value).toContain("Unfinished"); expect(f.fetch.mock.calls.some(([url]) => url.endsWith(`/${second}`))).toBe(false);
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true); await f.user.click(screen.getByRole("button", { name: /Sarah Kamara/ })); await screen.findByRole("heading", { name: "Sarah Kamara" }); expect(screen.getByLabelText("Reason shown to the user").value).toBe("");
});
it("a temporary focus failure preserves feedback and a later background success cannot unlock a stale draft", async () => {
  let failed = false; const f = mount(url => failed ? response("Queue unavailable", 503) : reads(url));
  await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ })); await f.user.type(screen.getByLabelText("Reason shown to the user"), "Keep this private reason");
  failed = true; act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert"); expect(screen.getByLabelText("Reason shown to the user").value).toContain("Keep this");
  failed = false; const before = f.fetch.mock.calls.length; act(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => expect(f.fetch.mock.calls.length).toBeGreaterThan(before));
  expect(screen.getByRole("button", { name: "Save review decision" }).disabled).toBe(true); expect(screen.getByRole("button", { name: "Download supporting document 1" }).disabled).toBe(true);
  vi.spyOn(window, "confirm").mockReturnValue(false); await f.user.click(screen.getByRole("button", { name: "Reload reviews" })); expect(screen.getByLabelText("Reason shown to the user").value).toContain("Keep this");
});
it("blocks duplicate decisions and leaving the selection while a write is pending", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = mount((url, options) => options?.method === "POST" ? pending : reads(url));
  await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ })); await f.user.type(screen.getByLabelText("Reason shown to the user"), "Institution has checked the evidence.");
  const form = screen.getByLabelText("Decision").closest("form"); fireEvent.submit(form); fireEvent.submit(form);
  expect(f.fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1); expect(screen.getByRole("button", { name: "Close selected review" }).disabled).toBe(true); expect(screen.getByLabelText("Decision").matches(":disabled")).toBe(true);
  await act(async () => release(response({}))); await screen.findByText("Review decision saved. The applicant can read your feedback.");
});
it("a false-credential decision requires a supported-finding acknowledgement", async () => {
  const f = mount((url, options) => options?.method === "POST" ? response({}) : reads(url));
  await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ })); await f.user.selectOptions(screen.getByLabelText("Decision"), "FALSE_CREDENTIAL"); await f.user.type(screen.getByLabelText("Reason shown to the user"), "Issuer confirmed the submitted document is not authentic.");
  const save = screen.getByRole("button", { name: "Save review decision" }); expect(save.disabled).toBe(true); fireEvent.submit(save.closest("form")); expect(f.fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  await f.user.click(screen.getByLabelText(/I confirm that this finding is supported/)); await f.user.click(save);
  await waitFor(() => expect(f.fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
  const body = JSON.parse(f.fetch.mock.calls.find(([, options]) => options?.method === "POST")[1].body); expect(body).toMatchObject({ expectedVersion: 2, revision: 1, status: "FALSE_CREDENTIAL" });
});
it("evidence is downloaded through the private API and revoked access clears names and draft feedback", async () => {
  const download = vi.spyOn(credentialsApi, "download").mockRejectedValue(Object.assign(new Error("Reviewer access withdrawn"), { status: 403 }));
  const f = mount(url => reads(url)); await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ })); await f.user.type(screen.getByLabelText("Reason shown to the user"), "Unfinished private feedback");
  await f.user.click(screen.getByRole("button", { name: "Download supporting document 1" })); await screen.findByRole("alert"); expect(download).toHaveBeenCalledWith("asset", "application/pdf");
  expect(screen.queryByRole("heading", { name: "Grace Johnson" })).toBeNull(); expect(screen.queryByDisplayValue("Unfinished private feedback")).toBeNull(); expect(screen.queryByLabelText("Decision")).toBeNull();
});
it("rejects a mismatched organization response before showing private applicant names", async () => {
  const f = mount(() => response({ ...queue([review()]), organization: { id: second, name: "Foreign organization" } }));
  await screen.findByRole("alert"); expect(screen.queryByText("Grace Johnson")).toBeNull(); expect(screen.queryByText("Foreign organization")).toBeNull(); expect(f.setActingOrganization).toHaveBeenLastCalledWith(null);
});
it("keeps the applicant's name after a decision removes the review from the active filter", async () => {
  let decided = false;
  const f = mount((url, options) => {
    if (options?.method === "POST") { decided = true; return response({}); }
    return response(url.endsWith(`/${first}`) ? { review: { ...review(first, decided ? "VERIFIED" : "IN_REVIEW", decided ? 3 : 2), note: decided ? "Issuer confirmed the record." : null }, username: "grace" } : queue(decided ? [] : [review()]));
  }, "?status=IN_REVIEW");
  await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ })); await f.user.selectOptions(screen.getByLabelText("Decision"), "VERIFIED"); await f.user.type(screen.getByLabelText("Reason shown to the user"), "Issuer confirmed the record."); await f.user.click(screen.getByRole("button", { name: "Save review decision" }));
  await screen.findByText("Review decision saved. The applicant can read your feedback."); expect(screen.getByRole("heading", { name: "Grace Johnson" })).toBeTruthy(); expect(screen.queryByRole("heading", { name: "@grace" })).toBeNull(); expect(screen.queryByLabelText("Decision")).toBeNull();
  expect(within(screen.getByRole("region", { name: "Selected credential review" })).getByText("Issuer confirmed the record.")).toBeTruthy();
});
it("an uncertain decision response preserves the reason and requires reload instead of resubmission", async () => {
  const f = mount((url, options) => options?.method === "POST" ? response("Decision response unavailable", 503) : reads(url));
  await f.user.click(await screen.findByRole("button", { name: /Grace Johnson/ }));
  await f.user.type(screen.getByLabelText("Reason shown to the user"), "Keep this reason until the saved state is checked.");
  await f.user.click(screen.getByRole("button", { name: "Save review decision" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("Reason shown to the user").value).toContain("Keep this reason"); expect(screen.getByRole("button", { name: "Save review decision" }).disabled).toBe(true);
  vi.spyOn(window, "confirm").mockReturnValue(true); await f.user.click(screen.getByRole("button", { name: "Reload reviews" })); await screen.findByText("Reviews are up to date.");
  expect(screen.getByLabelText("Reason shown to the user").value).toBe(""); expect(f.fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
