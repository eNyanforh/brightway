import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import OpportunityDetailPage from "../pages/OpportunityDetailPage";
import OpportunitiesPage from "../pages/OpportunitiesPage";
import OpportunityCard from "../components/opportunities/OpportunityCard";
import OrganizationApplications from "../components/opportunities/OrganizationApplications";
import OpportunityEditor from "../components/opportunities/OpportunityEditor";
import ChallengeSidebarCard from "../components/opportunities/ChallengeSidebarCard";
import NotificationsPage from "../pages/NotificationsPage";
const id = "33333333-3333-4333-8333-333333333333", qid = "44444444-4444-4444-8444-444444444444";
const org = { id: "22222222-2222-4222-8222-222222222222", name: "Research Institute" };
const opp = { id, organization: org, organizationId: org.id, type: "JOB", title: "Research assistant", description: "Support education research across communities.", location: "Monrovia", workMode: "IN_PERSON", deadline: "2099-12-01T12:00:00Z", status: "PUBLISHED", version: 2, questions: [{ id: qid, type: "YES_NO", label: "Can you join our team?", required: true, options: [] }] };
const app = { id: "55555555-5555-4555-8555-555555555555", opportunity: opp, status: "DRAFT", version: 1, answers: {}, files: [], events: [] };
const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } }));
function mount(component, path = "/opportunities/" + id) { render(<AuthContext.Provider value={{ account: { id: "owner" } }}><MemoryRouter initialEntries={[path]}><Routes><Route path="/opportunities/:id" element={component} /><Route path="/opportunities" element={component} /><Route path="/test" element={component} /></Routes></MemoryRouter></AuthContext.Provider>); return userEvent.setup(); }
it("applicants preserve a false answer and drafts across failures, then explicitly share and submit", async () => {
  let fail = true; const writes = [];
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (options?.method === "PUT") { const body = JSON.parse(options.body); writes.push(body); return fail ? reply("Complete your profile before applying.", 403) : reply({ ...app, status: "SUBMITTED", version: 2, answers: body.answers, events: [{ id: "event", toStatus: "SUBMITTED", createdAt: "2030-01-15T12:00:00Z" }] }); }
    return reply({ opportunity: opp, application: null });
  }));
  const user = mount(<OpportunityDetailPage />);
  const question = await screen.findByLabelText("Can you join our team?"); await user.selectOptions(question, "false");
  expect(screen.getByRole("button", { name: "Submit application" }).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Submit application" }));
  await screen.findByRole("alert"); expect(question.value).toBe("false"); expect(writes[0]).toMatchObject({ shareProfile: true, expectedVersion: 0, expectedOpportunityVersion: 2, answers: { [qid]: false } });
  fail = false; await user.click(screen.getByRole("button", { name: "Submit application" }));
  await screen.findByRole("heading", { name: "Application timeline" }); expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
});
it("opportunity publisher shows avatar and name and only a verified badge for approved organizations", () => {
  const verified = { ...opp, organization: { ...org, profilePhotoId: "published-photo", verifiedAt: "2026-11-01T00:00:00Z" } };
  const { rerender } = render(<MemoryRouter><OpportunityCard opportunity={verified} /></MemoryRouter>);
  const photo = screen.getByRole("img", { name: "Research Institute profile picture" });
  expect(photo.getAttribute("src")).toBe("/api/v1/organizations/" + org.id + "/photo/published-photo");
  expect(screen.getByRole("link", { name: "Research Institute" }).getAttribute("href")).toBe("/organizations/" + org.id);
  expect(screen.getByRole("img", { name: "Verified organization" })).toBeTruthy();
  rerender(<MemoryRouter><OpportunityCard opportunity={{ ...verified, organization: { ...verified.organization, verifiedAt: null } }} /></MemoryRouter>);
  expect(screen.queryByRole("img", { name: "Verified organization" })).toBeNull();
});
it("opportunity discovery exposes four filters and uses live on-platform links", async () => {
  const fetch = vi.fn(() => reply({ items: [opp], nextCursor: null })); vi.stubGlobal("fetch", fetch);
  const user = mount(<OpportunitiesPage />, "/opportunities");
  await screen.findByRole("link", { name: "Research assistant" });
  expect(screen.getByRole("link", { name: /Apply/ }).getAttribute("href")).toBe("/opportunities/" + id);
  expect(screen.queryByText("YOUR NEXT STEP")).toBeNull();
  expect(screen.getByRole("heading", { name: "Opportunities that move you forward." })).toBeTruthy();
  expect(screen.getByText("Find work, fund your education, take on a challenge, or join an event. Apply right here on BrightWay.").classList.contains("bw-op-intro")).toBe(true);
  const filters = screen.getByRole("navigation", { name: "Opportunity types" });
  await user.click(within(filters).getByRole("button", { name: "Scholarships" }));
  await waitFor(() => expect(fetch.mock.calls.at(-1)[0]).toContain("type=SCHOLARSHIP"));
});
it("reviewers keep feedback after a conflict and clear private applications when access is revoked", async () => {
  let denied = false;
  const submitted = { ...app, status: "SUBMITTED", canReview: true, submittedAt: "2030-01-15T12:00:00Z", profileSnapshot: { name: "Synthetic Applicant", skills: [], interests: [] }, opportunitySnapshot: { title: opp.title, questions: opp.questions } };
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (denied) return reply("Organization access revoked", 403);
    if (options?.method === "PUT") return reply("Another reviewer changed this application", 409);
    return reply(url.includes("/applications/" + app.id) ? submitted : { items: [submitted], nextCursor: null });
  }));
  const user = mount(<OrganizationApplications organization={org} />, "/test");
  await user.click(await screen.findByRole("button", { name: /Synthetic Applicant/ }));
  await user.selectOptions(screen.getByLabelText("Decision"), "SHORTLISTED"); await user.type(screen.getByLabelText("Message to applicant"), "An interview is next.");
  await user.click(screen.getByRole("button", { name: "Save decision" })); await screen.findByRole("alert");
  expect(screen.getByLabelText("Message to applicant").value).toBe("An interview is next."); expect(screen.getByRole("button", { name: "Save decision" }).disabled).toBe(true);
  denied = true; await user.click(screen.getByRole("button", { name: "Reload application queue" })); await screen.findByText("Organization access revoked");
  expect(screen.queryByText("Synthetic Applicant")).toBeNull();
});
it("the publisher uses type selection and the step-by-step form to save a BrightWay draft", async () => {
  const saved = vi.fn();
  const fetch = vi.fn((_url, opts) => reply({ ...opp, ...JSON.parse(opts.body), status: "DRAFT", version: 1 }));
  vi.stubGlobal("fetch", fetch);
  const user = mount(<OpportunityEditor organizationId={org.id} onSaved={saved} onClose={() => {}} />, "/test");
  expect(screen.getByRole("heading", { name: "What opportunity do you want to offer?" })).toBeTruthy();
  await user.click(screen.getByRole("radio", { name: /Job/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Title", { exact: true }), "Data internship");
  await user.type(screen.getByLabelText("Description", { exact: true }), "Learn research and data quality skills with our team.");
  await user.type(screen.getByLabelText("Location"), "Monrovia");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Deadline (your local time)"), "2099-12-01T12:00");
  await user.click(screen.getByRole("button", { name: "+ Add question" }));
  await user.type(screen.getByLabelText("Question 1 text"), "Tell us about your experience");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Review" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.questions[0]).toMatchObject({ label: "Tell us about your experience", type: "SHORT_ANSWER", required: true });
  expect(body).not.toHaveProperty("applicationUrl");
});
it("the right-rail Challenge card shows a first-party photo, publisher, topics and Take Part", () => {
  const challenge = {
    ...opp, type: "CHALLENGE", prize: "US$1,000", topics: ["Technology", "Education"], coverImage: "SCHOOLS",
    participantSummary: { count: 1, members: [{ username: "student_a", name: "Student One", photoId: null, verified: true }] },
    organization: { ...org, profilePhotoId: "publisher-photo", verifiedAt: "2026-11-01T00:00:00Z" },
  };
  render(<MemoryRouter><aside className="bw-explore-right"><ChallengeSidebarCard opportunity={challenge} /></aside></MemoryRouter>);
  const article = screen.getByRole("article", { name: "Challenge: Research assistant" });
  expect(article.querySelector(".bw-rail-challenge-photo").getAttribute("src")).toBe("/images/hero/schools-720.webp");
  expect(within(article).getByText("US$1,000")).toBeTruthy();
  expect(article.querySelector(".bw-rail-challenge-prize-mode").textContent).toContain("On BrightWay");
  expect(article.querySelector(".bw-rail-challenge-logo")).toBeTruthy();
  expect(article.querySelector(".bw-challenge-participants").textContent).toContain("1 participant");
  const closing = article.querySelector(".bw-rail-challenge-closing-row");
  const participants = article.querySelector(".bw-challenge-participants");
  expect(closing.compareDocumentPosition(participants) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(article).getByRole("link", { name: "View Research Institute organization profile" })).toBeTruthy();
  expect(within(article).getByRole("heading", { name: "Research assistant" })).toBeTruthy();
  expect(within(article).getByRole("list", { name: "Challenge categories" }).textContent).toContain("Technology");
  expect(within(article).getByRole("link", { name: "Take Part" }).getAttribute("href")).toBe("/opportunities/" + id);
  expect(within(article).getByText(/Closes in/)).toBeTruthy();
  expect(within(article).getByRole("link", { name: "Challenge" }).getAttribute("href")).toBe("/opportunities?type=CHALLENGE");
});

it("Challenge wizard supports prizes, categories, image fallback and native applicant limits", async () => {
  const saved = vi.fn();
  const fetch = vi.fn((_url, opts) => reply({ ...opp, ...JSON.parse(opts.body), status: "DRAFT", version: 1 }));
  vi.stubGlobal("fetch", fetch);
  const user = mount(<OpportunityEditor organizationId={org.id} onSaved={saved} onClose={() => {}} />, "/test");
  await user.click(screen.getByRole("radio", { name: /Challenge/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("checkbox", { name: "Technology" }));
  await user.click(screen.getByRole("checkbox", { name: "Education" }));
  await user.click(screen.getByRole("checkbox", { name: "Design" }));
  expect(screen.getByRole("checkbox", { name: "Coding" }).disabled).toBe(true);
  await user.type(screen.getByLabelText("Challenge Title"), "Learning Innovation Challenge");
  await user.type(screen.getByLabelText("Description"), "Design an innovation that improves access to education.");
  expect(screen.queryByLabelText("Format")).toBeNull();
  expect(screen.queryByLabelText("Location")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "+ Add Prize" }));
  await user.selectOptions(screen.getByLabelText("Prize Type"), "SCHOLARSHIP");
  await user.type(screen.getByLabelText("Prize details"), "Full tuition");
  await user.click(screen.getByRole("button", { name: "+ Add another prize" }));
  expect(screen.getAllByLabelText("Prize Type")).toHaveLength(2);
  await user.selectOptions(screen.getAllByLabelText("Prize Type")[1], "CASH");
  await user.type(screen.getAllByLabelText("Prize details")[1], "US$500");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.selectOptions(screen.getByLabelText("Default background photograph"), "SCHOOLS");
  expect(screen.getByLabelText("Background Image")).toBeTruthy();
  expect(screen.getByLabelText("Challenge Title Image")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Deadline (your local time)"), "2099-12-01T12:00");
  await user.type(screen.getByLabelText("Number of Applicants (maximum)"), "30");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("On BrightWay only")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.coverImage).toBe("SCHOOLS");
  expect(body.topics).toEqual(["Technology", "Education", "Design"]);
  expect(body.prizes).toEqual([
    { type: "SCHOLARSHIP", description: "Full tuition" },
    { type: "CASH", description: "US$500" },
  ]);
  expect(body.maxApplicants).toBe(30);
  expect(body.workMode).toBe("REMOTE");
  expect(body.location).toBe("BrightWay");
  expect(body).not.toHaveProperty("applicationUrl");
});

it("application decisions appear in Notifications with All and Unread views", async () => {
  const notice = { id: qid, kind: "APPLICATION_STATUS", createdAt: "2030-01-15T12:00:00Z", readAt: null, application: { id: app.id, title: opp.title, status: "SHORTLISTED" } };
  const fetch = vi.fn((_url, opts) => reply(opts?.method === "POST" ? { updated: true } : { items: [notice], nextCursor: null })); vi.stubGlobal("fetch", fetch);
  const user = mount(<NotificationsPage />, "/test");
  expect((await screen.findByRole("link", { name: opp.title })).getAttribute("href")).toBe("/applications/" + app.id);
  await user.click(screen.getByRole("button", { name: "Unread", exact: true })); await screen.findByRole("link", { name: opp.title });
  expect(fetch.mock.calls.at(-1)[0]).toContain("view=unread"); await user.click(screen.getByRole("button", { name: "Mark read", exact: true }));
  await waitFor(() => expect(screen.queryByRole("link", { name: opp.title })).toBeNull());
});
