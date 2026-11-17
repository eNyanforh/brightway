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
import OpportunityBrowser from "../components/opportunities/OpportunityBrowser";
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
it("publishes a six-step Job Vacancy draft with requirements and native document uploads", async () => {
  const saved = vi.fn();
  const fetch = vi.fn((_url, opts) => reply({ ...opp, ...JSON.parse(opts.body), status: "DRAFT", version: 1 }));
  vi.stubGlobal("fetch", fetch);
  const user = mount(<OpportunityEditor organizationId={org.id} onSaved={saved} onClose={() => {}} />, "/test");
  await user.click(screen.getByRole("radio", { name: /Job/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Job information" })).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Creation progress" })).toBeTruthy();
  await user.type(screen.getByLabelText("Job title"), "Data internship");
  await user.type(screen.getByLabelText("Description", { exact: true }), "Learn research and data quality skills with our team.");
  await user.selectOptions(screen.getByLabelText("Job category"), "Research");
  await user.selectOptions(screen.getByLabelText("Experience level"), "ENTRY");
  await user.selectOptions(screen.getByLabelText("Job type"), "INTERNSHIP");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Work location"), "Monrovia, Liberia");
  await user.selectOptions(screen.getByLabelText("Compensation"), "PAID");
  await user.type(screen.getByLabelText("Minimum salary"), "200");
  await user.type(screen.getByLabelText("Maximum salary"), "400");
  await user.selectOptions(screen.getByLabelText("Currency"), "USD");
  await user.selectOptions(screen.getByLabelText("Pay period"), "MONTH");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Job responsibilities"), "Support field data collection");
  await user.type(screen.getByLabelText("Required qualifications"), "High school completion");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText(/Required documents:/)).toBeTruthy();
  await user.type(screen.getByLabelText("Deadline (your local time)"), "2099-12-01T12:00");
  await user.click(screen.getByRole("button", { name: "+ Add question" }));
  await user.type(screen.getByLabelText("Question 2 text"), "Describe relevant experience");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.details).toMatchObject({ category: "Research", experienceLevel: "ENTRY", requireCv: true });
  expect(body.jobDetails).toMatchObject({ type: "INTERNSHIP", compensationType: "PAID", salaryMin: 200, salaryMax: 400 });
  expect(body.questions.some(q => q.label === "Required document: CV / résumé" && q.type === "FILE_UPLOAD" && q.required)).toBe(true);
  expect(body.questions.some(q => q.label === "Describe relevant experience")).toBe(true);
  expect(body).not.toHaveProperty("applicationUrl");
});
it("creates a scholarship with funding, eligibility and required document uploads", async () => {
  const saved = vi.fn(), fetch = vi.fn((_url, opts) => reply({ ...opp, ...JSON.parse(opts.body), status: "DRAFT" }));
  vi.stubGlobal("fetch", fetch);
  const user = mount(<OpportunityEditor organizationId={org.id} onSaved={saved} onClose={() => {}} />, "/test");
  await user.click(screen.getByRole("radio", { name: /Scholarship/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Scholarship title"), "Liberia Research Scholarship");
  await user.type(screen.getByLabelText("Description", { exact: true }), "Funding for students pursuing research in public health.");
  await user.selectOptions(screen.getByLabelText("Scholarship category"), "RESEARCH");
  await user.click(screen.getByLabelText("Masters"));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.selectOptions(screen.getByLabelText("Funding type"), "FULLY_FUNDED");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Study destination"), "Liberia");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Eligible countries"), "Liberia");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Selection criteria"), "Academic merit");
  await user.type(screen.getByLabelText("Deadline (your local time)"), "2099-12-01T12:00");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Publish Scholarship" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.type).toBe("SCHOLARSHIP");
  expect(fetch.mock.calls).toHaveLength(2);
  expect(fetch.mock.calls[1][0]).toContain("/status");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ status: "PUBLISHED" });
  expect(body.details).toMatchObject({ category: "RESEARCH", fundingType: "FULLY_FUNDED", academicLevels: ["MASTERS"], eligibleCountries: ["Liberia"] });
  expect(body.questions.some(q => q.label === "Required document: Academic transcript" && q.required)).toBe(true);
  expect(body.questions.some(q => q.label === "Required document: Personal statement" && q.required)).toBe(true);
});
it("the right-rail Challenge card stacks its cover, details and Partake action", () => {
  const challenge = {
    ...opp, type: "CHALLENGE", prize: "US$1,000", topics: ["Technology", "Education"], coverImage: "SCHOOLS",
    description: "A research opportunity for students.",
    participantSummary: { count: 1, members: [{ username: "student_a", name: "Student One", photoId: null, verified: true }] },
    organization: { ...org, profilePhotoId: "publisher-photo", verifiedAt: "2026-11-01T00:00:00Z" },
  };
  render(<MemoryRouter><aside className="bw-explore-right"><ChallengeSidebarCard opportunity={challenge} /></aside></MemoryRouter>);
  const article = screen.getByRole("article", { name: "Challenge: Research assistant" });
  const cover = within(article).getByRole("link", { name: "View challenge: Research assistant" });
  expect(cover.getAttribute("href")).toBe("/opportunities/" + id);
  expect(cover.querySelector(".bw-rail-challenge-photo").getAttribute("src")).toBe("/images/hero/schools-720.webp");
  expect(within(article).getByRole("heading", { name: "Research assistant" })).toBeTruthy();
  expect(within(article).getByRole("link", { name: "View Research Institute organization profile" })).toBeTruthy();
  expect(within(article).getByText(challenge.description)).toBeTruthy();
  expect(article.querySelector(".bw-rail-challenge-prize strong").textContent).toBe("US$1,000");
  expect(article.querySelector(".bw-challenge-participants").textContent).toContain("1 participant");
  expect(article.textContent).not.toContain("On BrightWay");
  expect(within(article).queryByRole("list", { name: "Challenge categories" })).toBeNull();
  const elements = [...article.querySelectorAll(".bw-rail-challenge-cover, .bw-rail-challenge-details, .bw-rail-challenge-cta")];
  expect(elements.map(element => element.className)).toEqual([
    "bw-rail-challenge-cover", "bw-rail-challenge-details", "bw-rail-challenge-cta",
  ]);
  expect(within(article).getByRole("link", { name: "Partake" }).getAttribute("href")).toBe("/opportunities/" + id);
  expect(within(article).getByText(/Closes in/)).toBeTruthy();
});

it("Jobs use the same cover, details and CTA structure as Challenges without Challenge-only data", () => {
  const fullTimePaid = { ...opp, jobDetails: { type: "FULL_TIME", compensationType: "PAID",
    salaryMin: 400, salaryMax: 800, salaryCurrency: "USD", salaryPeriod: "MONTH" } };
  render(<MemoryRouter><aside className="bw-explore-right"><ChallengeSidebarCard opportunity={fullTimePaid} /></aside></MemoryRouter>);
  const card = screen.getByRole("article", { name: "Job Vacancy: Research assistant" });
  expect(card.classList.contains("bw-rail-opportunity-job")).toBe(true);
  const cover = within(card).getByRole("link", { name: "View job vacancy: Research assistant" });
  expect(cover.querySelector(".bw-rail-opportunity-cover-fallback")).toBeTruthy();
  expect(within(card).getByRole("heading", { name: opp.title })).toBeTruthy();
  expect(within(card).getByText("Monrovia")).toBeTruthy();
  expect(within(card).getByText("In person")).toBeTruthy();
  expect(within(card).getByText("Full-time").classList.contains("bw-job-detail-type")).toBe(true);
  expect(within(card).getByText("Paid").classList.contains("bw-job-detail-compensation")).toBe(true);
  expect(within(card).getByText("US$400–US$800/month")).toBeTruthy();
  expect(within(card).getByRole("link", { name: "Apply Now", exact: true }).getAttribute("href")).toBe("/opportunities/" + id);
  expect(card.querySelector(".bw-rail-challenge-prize")).toBeNull();
  expect(card.querySelector(".bw-challenge-participants")).toBeNull();
  const layout = [...card.querySelectorAll(".bw-rail-challenge-cover, .bw-rail-challenge-details, .bw-rail-challenge-cta")];
  expect(layout.map(element => element.className)).toEqual([
    "bw-rail-challenge-cover", "bw-rail-challenge-details", "bw-rail-challenge-cta",
  ]);
});

it("Jobs and Challenges share the same card layout in compact Explore and the Opportunities catalog", async () => {
  const challenge = { ...opp, id: qid, type: "CHALLENGE", title: "Student innovation challenge", coverImage: "SCHOOLS", prize: "US$500" };
  vi.stubGlobal("fetch", vi.fn(() => reply({ items: [challenge, opp], nextCursor: null })));
  const { unmount } = render(<AuthContext.Provider value={{ account: { id: "owner" } }}>
    <MemoryRouter><aside className="bw-explore-right"><OpportunityBrowser compact /></aside></MemoryRouter>
  </AuthContext.Provider>);
  const job = await screen.findByRole("article", { name: "Job Vacancy: Research assistant" });
  const challengeCard = screen.getByRole("article", { name: "Challenge: Student innovation challenge" });
  expect(job.querySelector(".bw-rail-challenge-cover")).toBeTruthy();
  expect(challengeCard.querySelector(".bw-rail-challenge-cover")).toBeTruthy();
  unmount();
  mount(<OpportunitiesPage />, "/opportunities");
  const catalogJob = await screen.findByRole("article", { name: "Job Vacancy: Research assistant" });
  const catalogChallenge = screen.getByRole("article", { name: "Challenge: Student innovation challenge" });
  expect(catalogJob.querySelector(".bw-rail-challenge-cover")).toBeTruthy();
  expect(catalogChallenge.querySelector(".bw-rail-challenge-cover")).toBeTruthy();
});

it("Job cards show uploaded covers when the publisher provides one", () => {
  const jobWithCover = { ...opp, coverAssetId: "88888888-8888-4888-8888-888888888888" };
  render(<MemoryRouter><ChallengeSidebarCard opportunity={jobWithCover} /></MemoryRouter>);
  const article = screen.getByRole("article", { name: "Job Vacancy: Research assistant" });
  expect(article.querySelector(".bw-rail-challenge-photo").getAttribute("src")).toContain("/challenge-assets/");
  expect(article.querySelector(".bw-rail-opportunity-cover-fallback")).toBeNull();
});

it("Challenge composer supports collaborators, cover, multiple post types and no applicant limit", async () => {
  const saved = vi.fn();
  const coverId = "88888888-8888-4888-8888-888888888888";
  const fetch = vi.fn((url, opts) =>
    url.includes("/challenge-assets")
      ? reply({ id: coverId, kind: "COVER", size: 3000 })
      : reply({ ...opp, ...JSON.parse(opts.body), status: "DRAFT", version: 1 }));
  vi.stubGlobal("fetch", fetch);
  const user = mount(<OpportunityEditor organizationId={org.id} onSaved={saved} onClose={() => {}} />, "/test");
  await user.click(screen.getByRole("radio", { name: /Challenge/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Create your Challenge" })).toBeTruthy();
  expect(screen.getByLabelText("Challenge cover photo")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Post types" })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Creation progress" })).toBeNull();
  await user.click(screen.getByRole("checkbox", { name: "Technology" }));
  await user.click(screen.getByRole("checkbox", { name: "Education" }));
  await user.click(screen.getByRole("checkbox", { name: "Design" }));
  expect(screen.getByRole("checkbox", { name: "Coding" }).disabled).toBe(true);
  await user.type(screen.getByLabelText("Challenge Title"), "Learning Innovation Challenge");
  await user.type(screen.getByLabelText("Description"), "Design an innovation that improves access to education.");
  expect(screen.queryByLabelText("Format")).toBeNull();
  expect(screen.queryByLabelText("Location")).toBeNull();

  await user.click(screen.getByRole("button", { name: "+ Add Prize" }));
  await user.selectOptions(screen.getByLabelText("Prize 1 type"), "SCHOLARSHIP");
  expect(screen.queryByLabelText("Prize 1 amount")).toBeNull();
  await user.type(screen.getByLabelText("Scholarship Coverage"), "Full tuition");
  await user.click(screen.getByRole("button", { name: "+ Add another prize" }));
  expect(screen.getByLabelText("Prize 2 type").value).toBe("CASH");
  await user.type(screen.getByLabelText("Prize 2 amount"), "500");
  await user.selectOptions(screen.getByLabelText("Prize 2 currency"), "LRD");

  expect(screen.queryByLabelText("Default background photograph")).toBeNull();
  expect(screen.queryByLabelText("Background Image")).toBeNull();
  expect(screen.queryByLabelText("Challenge Title Image")).toBeNull();
  await user.upload(screen.getByLabelText("Challenge cover photo"),
    new File(["synthetic cover"], "cover.png", { type: "image/png" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes("/challenge-assets"))).toBe(true));
  await waitFor(() => expect(screen.getByAltText("Challenge cover photo preview")).toBeTruthy());

  await user.click(screen.getByRole("button", { name: "+ Add post type" }));
  expect(screen.getByRole("combobox", { name: "Post type 1" }).value).toBe("VIDEO_POST");
  await user.click(screen.getByRole("button", { name: "+ Add post type" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Post type 2" }), "CAPTION");
  expect(screen.getByRole("spinbutton", { name: "Post type 2 Maximum words" })).toBeTruthy();

  expect(screen.queryByLabelText("Number of Applicants (maximum)")).toBeNull();
  await user.type(screen.getByLabelText("Deadline (your local time)"), "2099-12-01T12:00");

  expect(screen.getByRole("heading", { name: "Post types" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetch.mock.calls.find(([, opts]) => opts?.headers?.["Content-Type"] === "application/json")[1].body);
  expect(body.coverAssetId).toBe(coverId);
  expect(body.collaboratorIds).toEqual([]);
  expect(body.sponsorLogoIds).toEqual([]);
  expect(body.titleAssetId).toBeNull();
  expect(body.backgroundAssetId).toBeNull();
  expect(body.topics).toEqual(["Technology", "Education", "Design"]);
  expect(body.prizes).toEqual([
    { type: "SCHOLARSHIP", coverage: "Full tuition", institution: "" },
    { type: "CASH", amount: 500, currency: "LRD" },
  ]);
  expect(body).not.toHaveProperty("maxApplicants");
  expect(body.postRequirements).toHaveLength(2);
  expect(body.postRequirements.map(row => row.type)).toEqual(["VIDEO_POST", "CAPTION"]);
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
