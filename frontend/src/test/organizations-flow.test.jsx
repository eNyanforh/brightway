import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, it, expect } from "vitest";
import { AuthContext } from "../auth/auth-context";
import OrganizationRequestsPage from "../pages/OrganizationRequestsPage";
import OrganizationReviewPage from "../pages/OrganizationReviewPage";
import OrganizationPage from "../pages/OrganizationPage";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59";
const response = (data, status = 200) => new Response(JSON.stringify(status >= 400 ? { success: false, message: data } : { success: true, data }), { status, headers: { "Content-Type": "application/json" } });
function tree(Page, actor = "owner") { return <MemoryRouter><AuthContext.Provider value={{ account: { id: actor } }}><Page /></AuthContext.Provider></MemoryRouter>; }
function owner(handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/access")) return response({ agent: false, approver: false });
    return handler ? handler(url, options) : response({ requests: [] });
  }); vi.stubGlobal("fetch", fetchMock); const view = render(tree(OrganizationRequestsPage)); return { user: userEvent.setup(), fetchMock, view };
}
async function fill(user, type = "SCHOOL") {
  await user.type(await screen.findByLabelText("Organization name"), "Global Learning Centre");
  await user.selectOptions(screen.getByLabelText("Organization type"), type);
  await user.type(screen.getByLabelText("Your representative role"), "Director");
  await user.selectOptions(screen.getByLabelText("Country of operation"), "GH");
  await user.type(screen.getByLabelText("City / locality"), "Accra");
  await user.type(screen.getByLabelText("Operating address"), "Synthetic test address");
  if (type !== "SCHOOL") await user.selectOptions(screen.getByLabelText("Can this organization offer training/education also?"), "yes");
}
it("submits a global school request without evidence or injected ownership and keeps it private pending approval", async () => {
  let release; const promise = new Promise(resolve => { release = resolve; });
  const f = owner(async (url, options) => options?.method === "POST" ? promise : response({ requests: [] }));
  await fill(f.user); const form = screen.getByLabelText("Organization name").closest("form"); fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(f.fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1));
  const [, options] = f.fetchMock.mock.calls.find(([, o]) => o?.method === "POST"), body = JSON.parse(options.body);
  expect(body).toMatchObject({ name: "Global Learning Centre", countryCode: "GH", representativeRole: "Director" });
  expect(Object.keys(body).sort()).toEqual(["name", "type", "representativeRole", "countryCode", "region", "city", "address", "idempotencyKey"].sort()); expect(options.credentials).toBe("include");
  release(response({ id, name: body.name, status: "SUBMITTED", version: 1, targetAt: "2026-10-30T12:00:00Z" }));
  await screen.findByText("Organization request submitted. It stays private until BrightWay approves it."); expect(screen.queryByRole("link", { name: "View organization" })).toBeNull();
});
it("requires the separate education capability answer for a non-school organization", async () => {
  const f = owner(async (url, options) => options?.method === "POST" ? response("Please check this request.", 400) : response({ requests: [] }));
  await fill(f.user, "NGO"); await f.user.click(screen.getByRole("button", { name: "Submit organization request" })); await screen.findByRole("alert");
  const body = JSON.parse(f.fetchMock.mock.calls.find(([, o]) => o?.method === "POST")[1].body); expect(body.offersTraining).toBe(true); expect(body.type).toBe("NGO");
  expect(screen.getByLabelText("Organization name").value).toBe("Global Learning Centre");
});
it("ambiguous submission failure retries the identical body and key while preserving form values", async () => {
  const f = owner(async (url, options) => options?.method === "POST" ? response("Response unavailable.", 503) : response({ requests: [] }));
  await fill(f.user); await f.user.click(screen.getByRole("button", { name: "Submit organization request" }));
  await f.user.click(await screen.findByRole("button", { name: "Retry same organization request" }));
  await waitFor(() => expect(f.fetchMock.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(2));
  const bodies = f.fetchMock.mock.calls.filter(([, o]) => o?.method === "POST").map(([, o]) => o.body); expect(bodies[0]).toBe(bodies[1]);
});
it("an account switch ignores late organization history and clears the previous draft", async () => {
  let release; const late = new Promise(resolve => { release = resolve; }); let first = true;
  vi.stubGlobal("fetch", vi.fn(async url => url.endsWith("/access") ? response({}) : first ? (first = false, late) : response({ requests: [] })));
  const view = render(tree(OrganizationRequestsPage, "first")); view.rerender(tree(OrganizationRequestsPage, "second"));
  await screen.findByLabelText("Organization name"); await act(async () => release(response({ requests: [{ id, name: "Private old account request", status: "SUBMITTED" }] })));
  expect(screen.queryByText("Private old account request")).toBeNull(); expect(screen.getByLabelText("Organization name").value).toBe("");
});
function review(mode = "agent", overrides = {}) {
  let allowed = true, changed = false; const calls = [];
  const detail = { id, name: "Global Learning Centre", version: 2, type: "SCHOOL", status: "ASSIGNED", location: { countryCode: "GH", city: "Accra", address: "Synthetic address" }, representativeRole: "Director", applicantUsername: "applicant", offersTraining: true,
    canAssign: mode === "assign", canReport: mode === "agent", canDecide: mode === "approver", finding: mode === "approver" ? { recommendation: "APPROVE", notes: "Private Agent findings", existenceConfirmed: true, locationConfirmed: true, authorityConfirmed: true, typeConfirmed: true, operationalConfirmed: true } : null, ...overrides };
  const fetchMock = vi.fn(async (url, options) => {
    if (!allowed) return response("Organization permission revoked.", 403);
    if (options?.method === "POST") { calls.push([url, JSON.parse(options.body)]); return changed ? response("Request changed. Reload.", 409) : response({ id }); }
    if (url.endsWith(id)) return response(detail);
    return response({ requests: [{ id, name: detail.name, status: detail.status }] });
  }); vi.stubGlobal("fetch", fetchMock); render(tree(OrganizationReviewPage, "operator"));
  return { user: userEvent.setup(), fetchMock, calls, revoke() { allowed = false; }, stale() { changed = true; } };
}
async function select(user) { await user.click(await screen.findByRole("button", { name: /Global Learning Centre ·/ })); await screen.findByText(/Requested by @applicant/); }
async function complete(user) {
  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
  await user.selectOptions(screen.getByLabelText("Recommendation"), "APPROVE");
  await user.type(screen.getByLabelText("Private verification notes"), "Synthetic field checks confirm all required facts.");
}
it("Agents submit a structured recommendation without a final approval control", async () => {
  const f = review(); await select(f.user); await complete(f.user);
  expect(screen.queryByLabelText("Final organization decision")).toBeNull();
  await f.user.click(screen.getByRole("button", { name: "Submit Agent recommendation" })); await screen.findByText(/Saved. Reload the organization queue/);
  expect(f.calls).toHaveLength(1); expect(f.calls[0][1]).toMatchObject({ expectedVersion: 2, recommendation: "APPROVE", operationalConfirmed: true });
});
it("unconfirmed findings disable a positive recommendation", async () => {
  const f = review(); await select(f.user); await f.user.selectOptions(screen.getByLabelText("Recommendation"), "APPROVE");
  expect(screen.getByRole("button", { name: "Submit Agent recommendation" }).disabled).toBe(true);
});
it("approvers use versioned explicit decisions and requester feedback", async () => {
  const f = review("approver"); await select(f.user); expect(screen.getByText("Private Agent findings")).toBeTruthy();
  await f.user.selectOptions(screen.getByLabelText("Final organization decision"), "APPROVE");
  await f.user.type(screen.getByLabelText("Feedback shown to the requester"), "The Agent findings support organization approval.");
  await f.user.click(screen.getByRole("button", { name: "Save organization decision" })); await screen.findByText(/Saved. Reload/);
  expect(f.calls[0][1]).toMatchObject({ expectedVersion: 2, decision: "APPROVE" });
});
it("stale recommendation failures preserve private feedback and require explicit reload", async () => {
  const f = review(); await select(f.user); await complete(f.user); f.stale();
  await f.user.click(screen.getByRole("button", { name: "Submit Agent recommendation" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("Private verification notes").value).toContain("Synthetic field checks"); expect(screen.getByRole("button", { name: "Submit Agent recommendation" }).disabled).toBe(true); expect(f.calls).toHaveLength(1);
});
it("valid focus checks retain unsaved Agent notes while revoked access clears private details", async () => {
  const f = review(); await select(f.user); await complete(f.user); act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(f.fetchMock.mock.calls.filter(([url]) => url.endsWith(id)).length).toBeGreaterThan(1));
  expect(screen.getByLabelText("Private verification notes").value).toContain("Synthetic field checks");
  f.revoke(); act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert");
  expect(screen.queryByLabelText("Private verification notes")).toBeNull(); expect(screen.queryByText(/Requested by @applicant/)).toBeNull();
});
it("a pending/unknown organization public URL cannot display verified presence", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response("Organization not found.", 404)));
  render(<MemoryRouter initialEntries={[`/organizations/${id}`]}><Routes><Route path="/organizations/:id" element={<OrganizationPage />} /></Routes></MemoryRouter>);
  await screen.findByRole("alert"); expect(screen.queryByLabelText("Verified organization")).toBeNull();
});
it("approved organization presence contains only the server's public projection", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ id, name: "Global Learning Centre", type: "SCHOOL", verified: true, offersTraining: true, locations: [{ countryCode: "GH", city: "Accra", address: "Synthetic address" }] })));
  render(<MemoryRouter initialEntries={[`/organizations/${id}`]}><Routes><Route path="/organizations/:id" element={<OrganizationPage />} /></Routes></MemoryRouter>);
  await screen.findByRole("heading", { name: /Global Learning Centre/ }); expect(screen.getByLabelText("Verified organization")).toBeTruthy(); expect(screen.queryByText("Private Agent findings")).toBeNull();
});

it("a recommended request with a revoked investigator offers reassignment, preserves private history and sends the current version", async () => {
  const entry = { id: "retired", sourceVersion: 3, recommendation: "APPROVE", notes: "Retired private findings for authorized approvers only.", createdAt: "2026-10-27T10:00:00Z", retiredAt: "2026-10-27T11:00:00Z" };
  const f = review("approver", { version: 5, status: "RECOMMENDED", canAssign: true, canDecide: false, requiresReassignment: true, findingHistory: [entry] });
  await select(f.user);
  expect(screen.queryByLabelText("Final organization decision")).toBeNull();
  expect(screen.getByText(/The investigating Agent is no longer authorized/)).toBeTruthy();
  expect(screen.getByText(entry.notes)).toBeTruthy();
  await f.user.type(screen.getByLabelText("Replacement Agent username"), "replacement_agent");
  await f.user.click(screen.getByRole("button", { name: "Assign replacement Agent" }));
  await screen.findByText(/Saved. Reload/);
  expect(f.calls).toHaveLength(1); expect(f.calls[0][0]).toContain("/assign");
  expect(f.calls[0][1]).toEqual({ expectedVersion: 5, agentUsername: "replacement_agent" });
});
it("a stale replacement assignment keeps the chosen Agent and requires an explicit reload", async () => {
  const f = review("approver", { version: 3, status: "RECOMMENDED", canAssign: true, canDecide: false, requiresReassignment: true });
  await select(f.user); await f.user.type(screen.getByLabelText("Replacement Agent username"), "replacement_agent"); f.stale();
  await f.user.click(screen.getByRole("button", { name: "Assign replacement Agent" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("Replacement Agent username").value).toBe("replacement_agent");
  expect(screen.getByRole("button", { name: "Assign replacement Agent" }).disabled).toBe(true); expect(f.calls).toHaveLength(1);
});
it("revocation clears retired findings as well as current private review details", async () => {
  const f = review("approver", { status: "RECOMMENDED", findingHistory: [{ id: "retired", sourceVersion: 3, notes: "Retired private history", recommendation: "APPROVE" }] });
  await select(f.user); expect(screen.getByText("Retired private history")).toBeTruthy();
  f.revoke(); act(() => window.dispatchEvent(new Event("focus"))); await screen.findByRole("alert");
  expect(screen.queryByText("Retired private history")).toBeNull(); expect(screen.queryByText("Private Agent findings")).toBeNull();
});
