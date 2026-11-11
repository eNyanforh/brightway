import DirectorySearchPage from "../pages/DirectorySearchPage";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import AdmissionDetailPage from "../pages/AdmissionDetailPage";
import LearningPage from "../pages/LearningPage";
import OrganizationApplications from "../components/learning/OrganizationApplications";
import CycleEditor from "../components/learning/CycleEditor";
import NotificationsPage from "../pages/NotificationsPage";
const id = "33333333-3333-4333-8333-333333333333", qid = "44444444-4444-4444-8444-444444444444";
const org = { id: "22222222-2222-4222-8222-222222222222", name: "Research Institute" };
const program = { id: "66666666-6666-4666-8666-666666666666", title: "Data science certificate", description: "Learn how to improve education through community research.", organization: org, type: "CERTIFICATE", field: "Data science", duration: "6 months", location: "Accra", countryCode: "GH", studyMode: "ONLINE", status: "PUBLISHED" };
const opp = { program, opensAt: "2026-01-01T00:00:00Z", id, organization: org, organizationId: org.id, type: "JOB", title: "Research assistant", description: "Support education research across communities.", location: "Monrovia", workMode: "IN_PERSON", deadline: "2099-12-01T12:00:00Z", status: "OPEN", version: 2, questions: [{ id: qid, type: "YES_NO", label: "Can you join our team?", required: true, options: [] }] };
const app = { id: "55555555-5555-4555-8555-555555555555", cycle: opp, status: "DRAFT", version: 1, answers: {}, files: [], events: [] };
const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } }));
function mount(component, path = "/learning/cycles/" + id) { render(<AuthContext.Provider value={{ account: { id: "owner" } }}><MemoryRouter initialEntries={[path]}><Routes><Route path="/learning/cycles/:id" element={component} /><Route path="/learning" element={component} /><Route path="/test" element={component} /></Routes></MemoryRouter></AuthContext.Provider>); return userEvent.setup(); }
it("applicants preserve a false answer and drafts across failures, then explicitly share and submit", async () => {
  let fail = true; const writes = [];
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (options?.method === "PUT") { const body = JSON.parse(options.body); writes.push(body); return fail ? reply("Complete your profile before applying.", 403) : reply({ ...app, status: "SUBMITTED", version: 2, answers: body.answers, events: [{ id: "event", toStatus: "SUBMITTED", createdAt: "2030-01-15T12:00:00Z" }] }); }
    return reply({ cycle: opp, application: null });
  }));
  const user = mount(<AdmissionDetailPage />);
  const question = await screen.findByLabelText("Can you join our team?"); await user.selectOptions(question, "false");
  expect(screen.getByRole("button", { name: "Submit application" }).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Submit application" }));
  await screen.findByRole("alert"); expect(question.value).toBe("false"); expect(writes[0]).toMatchObject({ shareProfile: true, expectedVersion: 0, expectedCycleVersion: 2, answers: { [qid]: false } });
  fail = false; await user.click(screen.getByRole("button", { name: "Submit application" }));
  await screen.findByRole("heading", { name: "Application timeline" }); expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
});
it("Discover supports global country and study-mode filters with internal program links", async () => {
  const fetch = vi.fn(() => reply({ items: [program], nextCursor: null })); vi.stubGlobal("fetch", fetch);
  const user = mount(<LearningPage />, "/learning");
  expect((await screen.findByRole("link", { name: program.title })).getAttribute("href")).toBe("/learning/programs/" + program.id);
  await user.selectOptions(screen.getByRole("combobox", { name: "Country", exact: true }), "GH");
  await user.selectOptions(screen.getByLabelText("Study mode"), "ONLINE");
  await user.click(screen.getByRole("button", { name: "Search", exact: true }));
  await waitFor(() => expect(fetch.mock.calls.at(-1)[0]).toContain("countryCode=GH"));
  expect(fetch.mock.calls.at(-1)[0]).toContain("studyMode=ONLINE");
});
it("reviewers keep feedback after a conflict and clear private applications when access is revoked", async () => {
  let denied = false;
  const submitted = { ...app, status: "SUBMITTED", canReview: true, submittedAt: "2030-01-15T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", skills: [], interests: [] }, cycleSnapshot: { title: opp.title, questions: opp.questions } };
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (denied) return reply("Organization access revoked", 403);
    if (options?.method === "PUT") return reply("Another reviewer changed this application", 409);
    return reply(url.includes("/admission-applications/" + app.id) ? submitted : { items: [submitted], nextCursor: null });
  }));
  const user = mount(<OrganizationApplications organization={org} />, "/test");
  await user.click(await screen.findByRole("button", { name: /Synthetic Applicant/ }));
  await user.selectOptions(screen.getByLabelText("Decision"), "WAITLISTED"); await user.type(screen.getByLabelText("Message to applicant"), "An interview is next.");
  await user.click(screen.getByRole("button", { name: "Save decision" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("Message to applicant").value).toBe("An interview is next."); expect(screen.getByRole("button", { name: "Save decision" }).disabled).toBe(true);
  denied = true; await user.click(screen.getByRole("button", { name: "Reload application queue" })); await screen.findByText("Organization access revoked");
  expect(screen.queryByText("Synthetic Applicant")).toBeNull();
});
it("publishers create repeat admission cycles with custom questions and no external apply option", async () => {
  const saved = vi.fn(), fetch = vi.fn((_url, opts) => reply({ ...opp, ...JSON.parse(opts.body), status: "DRAFT", version: 1 })); vi.stubGlobal("fetch", fetch);
  const user = mount(<CycleEditor organizationId={org.id} program={program} onSaved={saved} onClose={() => {}} />, "/test");
  await user.type(screen.getByLabelText("Intake or cycle name"), "January 2027 intake");
  await user.type(screen.getByLabelText("Applications open (your local time)"), "2099-01-01T12:00");
  await user.type(screen.getByLabelText("Application deadline (your local time)"), "2099-12-01T12:00");
  await user.click(screen.getByRole("button", { name: "+ Add question" })); await user.type(screen.getByLabelText("Question 1 text"), "Tell us about your experience");
  await user.click(screen.getByRole("button", { name: "Save draft" })); await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetch.mock.calls[0][1].body); expect(body.programId).toBe(program.id); expect(body.questions[0]).toMatchObject({ type: "SHORT_ANSWER", required: true }); expect(body).not.toHaveProperty("applicationUrl");
});
it("application decisions appear in Notifications with All and Unread views", async () => {
  const notice = { id: qid, kind: "ADMISSION_STATUS", createdAt: "2030-01-15T12:00:00Z", readAt: null, application: { id: app.id, title: opp.title, status: "WAITLISTED" } };
  const fetch = vi.fn((_url, opts) => reply(opts?.method === "POST" ? { updated: true } : { items: [notice], nextCursor: null })); vi.stubGlobal("fetch", fetch);
  const user = mount(<NotificationsPage />, "/test");
  expect((await screen.findByRole("link", { name: opp.title })).getAttribute("href")).toBe("/learning/applications/" + app.id);
  await user.click(screen.getByRole("button", { name: "Unread", exact: true })); await screen.findByRole("link", { name: opp.title });
  expect(fetch.mock.calls.at(-1)[0]).toContain("view=unread"); await user.click(screen.getByRole("button", { name: "Mark read", exact: true }));
  await waitFor(() => expect(screen.queryByRole("link", { name: opp.title })).toBeNull());
});

it("global Search includes published program discovery with internal detail links", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply({ items: [program], nextCursor: null })));
  mount(<DirectorySearchPage />, "/test?q=data&kind=programs");
  expect((await screen.findByRole("link", { name: program.title })).getAttribute("href")).toBe("/learning/programs/" + program.id);
  expect(screen.getByRole("link", { name: "Programs", exact: true }).getAttribute("aria-current")).toBe("page");
});
