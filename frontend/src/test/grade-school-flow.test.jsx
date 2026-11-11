import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import GradeSchoolWorkspace from "../components/grade-school/GradeSchoolWorkspace";
import MyCampus from "../components/grade-school/MyCampus";
import { schoolApi as api } from "../api/grade-school";
vi.mock("../api/grade-school", () => ({ schoolApi: Object.fromEntries(["setup", "admissions", "configure", "registrations", "register", "subject", "submit", "createSession", "myCampus", "myReport", "guardians", "guardianReport", "guardianDecision", "status", "report", "guardian", "assign"].map(key => [key, vi.fn()])) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const r = { id: "registration", studentId: "student", status: "ACTIVE", version: 2, periodId: "period", sectionId: "section", source: "DIRECT", student: { id: "student", status: "ACTIVE", version: 2, account: { id: "account", username: "student", fullName: "Synthetic Student" } }, period: { name: "Semester 1", year: { name: "2026–2027" } }, section: { id: "section", name: "A", schoolClass: { name: "Grade 10" } }, electives: [] };
const offering = { id: "offering", periodId: "period", sectionId: "section", subject: { id: "subject", name: "Mathematics", passingMark: 50 }, mode: "COMPULSORY", teacherId: "teacher", teacher: { fullName: "Synthetic Teacher", username: "teacher" }, section: r.section, period: r.period, schedules: [], version: 1 };
const setup = (manager = true) => ({ campusId: "school", displayName: "Synthetic Academy", periodId: "period", canManage: manager, subjects: [offering.subject], classes: [{ id: "class", name: "Grade 10", sections: [r.section] }], years: [{ id: "year", name: "2026–2027", periods: [{ id: "period", name: "Semester 1" }] }], offerings: [offering] });
const mount = element => { render(<MemoryRouter>{element}</MemoryRouter>); return userEvent.setup(); };
describe("Grade School academic workspace", () => {
  it("stores numeric subject fields and keeps values on API failure", async () => {
    api.setup.mockResolvedValue(setup()); api.configure.mockRejectedValueOnce(new Error("Subject already exists"));
    const user = mount(<GradeSchoolWorkspace campusId="school" />);
    await screen.findByRole("heading", { name: "Synthetic Academy" });
    await user.type(screen.getByLabelText("Subject name"), "History");
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    await screen.findByRole("alert"); expect(screen.getByLabelText("Subject name").value).toBe("History");
    expect(api.configure).toHaveBeenCalledWith("school", "subjects", { name: "History", passingMark: 50 });
  });
  it("teachers see assigned subjects without academic administration or student registration tools", async () => {
    api.setup.mockResolvedValue(setup(false)); api.subject.mockResolvedValue({ offering, students: [r], attendance: [], assessments: [] });
    mount(<GradeSchoolWorkspace campusId="school" />);
    await screen.findByRole("region", { name: "Selected subject" });
    expect(screen.queryByRole("button", { name: "Academic setup" })).toBeNull(); expect(screen.queryByRole("button", { name: "Students & guardians" })).toBeNull(); expect(screen.queryByLabelText("Teacher username")).toBeNull();
    expect(screen.getByRole("heading", { name: "Subject attendance" })).toBeTruthy();
  });
  it("draft attendance is a separate action and incomplete finalization stays in the editor", async () => {
    const attendance = { id: "session", heldOn: "2026-11-11", status: "DRAFT", version: 1, records: [] };
    api.setup.mockResolvedValue(setup(false)); api.subject.mockResolvedValue({ offering, students: [r], attendance: [attendance], assessments: [] }); api.submit.mockResolvedValue({ status: "DRAFT", version: 2 });
    const user = mount(<GradeSchoolWorkspace campusId="school" />);
    await user.click(await screen.findByRole("button", { name: "Edit attendance" }));
    await user.click(screen.getByRole("button", { name: "Submit final attendance" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Complete every student's record before final submission."); expect(api.submit).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Attendance for Synthetic Student"), "ABSENT");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith("school", "attendance", "session", { expectedVersion: 1, finalize: false, records: [{ registrationId: "registration", status: "ABSENT" }] }));
  });
  it("score entry enforces the displayed assessment maximum", async () => {
    api.setup.mockResolvedValue(setup(false)); api.subject.mockResolvedValue({ offering, students: [r], attendance: [], assessments: [{ id: "assessment", title: "Quiz", heldOn: "2026-11-11", status: "DRAFT", version: 1, maxScore: 50, weight: 20, scores: [] }] });
    const user = mount(<GradeSchoolWorkspace campusId="school" />); await user.click(await screen.findByRole("button", { name: "Enter scores" }));
    const input = screen.getByLabelText("Score for Synthetic Student"); expect(input.max).toBe("50"); await user.type(input, "51"); await user.click(screen.getByRole("button", { name: "Submit final grades" })); expect(api.submit).not.toHaveBeenCalled();
  });
  it("manager can pre-register with optional electives and period context", async () => {
    api.setup.mockResolvedValue(setup()); api.registrations.mockResolvedValue({ items: [], guardians: [], nextCursor: null }); api.register.mockResolvedValue({ id: "new" });
    const user = mount(<GradeSchoolWorkspace campusId="school" />); await user.click(await screen.findByRole("button", { name: "Students & guardians" }));
    const form = screen.getByRole("form", { name: "Register a student" }); await user.type(within(form).getByLabelText("Student username"), "returning_student"); await user.selectOptions(within(form).getByLabelText("Registration route"), "RETURNING"); await user.selectOptions(within(form).getByLabelText("Student section"), "section"); await user.click(within(form).getByRole("button", { name: "Confirm registration" }));
    expect(api.register).toHaveBeenCalledWith("school", { username: "returning_student", source: "RETURNING", periodId: "period", sectionId: "section", admissionId: null, electiveIds: [] });
  });
  it("accepted admission registration selects an applicant without manual IDs or application answers", async () => {
    api.setup.mockResolvedValue(setup()); api.registrations.mockResolvedValue({ items: [], guardians: [], nextCursor: null }); api.register.mockResolvedValue({ id: "new" });
    api.admissions.mockResolvedValue({ items: [{ id: "admission", applicant: { username: "accepted_student", fullName: "Accepted Student" }, cycleTitle: "Grade 10 admissions" }], nextCursor: null });
    const user = mount(<GradeSchoolWorkspace campusId="school" />); await user.click(await screen.findByRole("button", { name: "Students & guardians" }));
    await user.selectOptions(screen.getByLabelText("Registration route"), "ADMISSION");
    await screen.findByRole("option", { name: /Accepted Student/ });
    await user.selectOptions(screen.getByLabelText("Accepted admission"), "admission"); await user.selectOptions(screen.getByLabelText("Student section"), "section");
    await user.click(screen.getByRole("button", { name: "Confirm registration" }));
    expect(api.register).toHaveBeenCalledWith("school", { username: "accepted_student", source: "ADMISSION", admissionId: "admission", periodId: "period", sectionId: "section", electiveIds: [] });
  });
  it("a permission failure clears academic data instead of keeping a usable grade editor", async () => {
    api.setup.mockResolvedValue(setup()); api.configure.mockRejectedValue(Object.assign(new Error("Permission revoked"), { status: 403 }));
    const user = mount(<GradeSchoolWorkspace campusId="school" />); await screen.findByLabelText("Subject name"); await user.type(screen.getByLabelText("Subject name"), "History"); await user.click(screen.getByRole("button", { name: "Add subject" })); await screen.findByText("Permission revoked"); expect(screen.queryByLabelText("Subject name")).toBeNull();
  });
});
describe("learner and guardian Campus access", () => {
  it("pre-registered students see the school's welcome and Come Later without requesting academic data", async () => {
    api.myCampus.mockResolvedValue({ items: [{ id: "registration", schoolName: "Synthetic Academy", year: "2026", period: "Semester 1", section: "Grade 10 / A", status: "PRE_REGISTERED", studentStatus: "PRE_REGISTERED", message: "Welcome, Emmanuel! Your registration has been confirmed by the school. Your Campus access is currently being finalized." }] });
    mount(<MyCampus />); await screen.findByText(/Welcome, Emmanuel!/); expect(screen.getByRole("link", { name: "Come Later" }).getAttribute("href")).toBe("/explore"); expect(api.myReport).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Open my Campus" })).toBeNull();
  });
  it("only active student registration opens a private finalized report", async () => {
    api.myCampus.mockResolvedValue({ items: [{ id: "registration", schoolName: "Synthetic Academy", year: "2026", period: "Semester 1", section: "Grade 10 / A", status: "ACTIVE", studentStatus: "ACTIVE" }] }); api.myReport.mockResolvedValue({ registration: r, subjects: [{ offering, grade: { percent: 88, passingMark: 50, outcome: "PASS" }, assessments: [], attendance: [] }], announcements: [] });
    const user = mount(<MyCampus />); await user.click(await screen.findByRole("button", { name: "Open my Campus" })); await screen.findByRole("region", { name: "Student academic report" }); expect(screen.getByText("88%")).toBeTruthy(); expect(api.myReport).toHaveBeenCalledWith("registration", expect.any(AbortSignal));
  });
  it("an unavailable school keeps active registration details visible without an academic entry button", async () => {
    api.myCampus.mockResolvedValue({ items: [{ id: "registration", schoolName: "Synthetic Academy", year: "2026", period: "Semester 1", section: "Grade 10 / A", status: "ACTIVE", studentStatus: "ACTIVE", available: false }] });
    mount(<MyCampus />); await screen.findByText(/Campus access is unavailable/); expect(screen.queryByRole("button", { name: "Open my Campus" })).toBeNull(); expect(api.myReport).not.toHaveBeenCalled();
  });
  it("a pending guardian must confirm explicitly and cannot open student reports", async () => {
    const pending = { id: "link", schoolName: "Synthetic Academy", student: { fullName: "Synthetic Student" }, status: "PENDING", relationship: "Parent", version: 1, registrations: [] };
    api.guardians.mockResolvedValue({ items: [pending] }); api.guardianDecision.mockResolvedValue({ status: "CONFIRMED" });
    const user = mount(<MyCampus guardians />); await screen.findByText("Synthetic Student"); expect(api.guardianReport).not.toHaveBeenCalled(); await user.click(screen.getByRole("button", { name: "Confirm guardian relationship" })); expect(api.guardianDecision).toHaveBeenCalledWith("link", { expectedVersion: 1, decision: "CONFIRM" });
  });
});
