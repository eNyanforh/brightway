import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CampusNavigation from "../components/layout/CampusNavigation";
import { CAMPUS_MODULE_BY_SECTION, CAMPUS_MODULES, canAccessCampusModule } from "../components/grade-school/campus-modules";

const campusId = "55555555-5555-4555-8555-555555555555";
const organization = { id: campusId, name: "Approved Institution" };
const academicAdmin = "organization.campus.academics.manage";
const teacher = "organization.campus.teach";
const mount = (engine, status, permissions = [], role = "STAFF") => render(
  <MemoryRouter initialEntries={[`/campus/${campusId}`]}>
    <CampusNavigation campus={{ organization, engine, status, permissions, role }} campusId={campusId} />
  </MemoryRouter>
);

describe("engine-specific Campus module navigation", () => {
  it("provides distinct, routable entries, not generic Academics-only tabs", () => {
    expect(Object.keys(CAMPUS_MODULE_BY_SECTION)).toHaveLength(12);
    expect(new Set(Object.keys(CAMPUS_MODULE_BY_SECTION)).size).toBe(12);
    expect(CAMPUS_MODULES.GRADE_SCHOOL.every(row => row.engine === undefined)).toBe(true);
    expect(CAMPUS_MODULE_BY_SECTION.attendance.engine).toBe("GRADE_SCHOOL");
    expect(CAMPUS_MODULE_BY_SECTION["tvet-attendance"].engine).toBe("TVET");
    mount("GRADE_SCHOOL", "ACTIVE", [academicAdmin, teacher]);
    const nav = within(screen.getByRole("navigation", { name: "Campus tools" }));
    expect(nav.getByRole("link", { name: "Student registration" }).getAttribute("href")).toBe(`/campus/${campusId}/registrations`);
    expect(nav.getByRole("link", { name: "Subject attendance" }).getAttribute("href")).toBe(`/campus/${campusId}/attendance`);
    expect(nav.getByRole("link", { name: "Results & reports" }).getAttribute("href")).toBe(`/campus/${campusId}/reports`);
    expect(nav.queryByRole("link", { name: "Competency assessments" })).toBeNull();
    expect(nav.queryByRole("link", { name: "Academics", exact: true })).toBeNull();
  });

  it("limits instructors to their assigned academic functions in TVET navigation", () => {
    mount("TVET", "ACTIVE", [teacher]);
    const nav = within(screen.getByRole("navigation", { name: "Campus tools" }));
    expect(nav.getByRole("link", { name: "Session attendance" })).toBeTruthy();
    expect(nav.getByRole("link", { name: "Competency assessments" })).toBeTruthy();
    expect(nav.queryByRole("link", { name: "Programs & intakes" })).toBeNull();
    expect(nav.queryByRole("link", { name: "Learners & completion" })).toBeNull();
    expect(nav.queryByRole("link", { name: "Completion & certificates" })).toBeNull();
    expect(canAccessCampusModule(CAMPUS_MODULE_BY_SECTION["tvet-learners"], [teacher])).toBe(false);
    expect(canAccessCampusModule(CAMPUS_MODULE_BY_SECTION["tvet-attendance"], [academicAdmin])).toBe(true);
  });

  it("does not expose academic module links when Campus is paused", () => {
    mount("TVET", "PAUSED", [teacher]);
    const nav = within(screen.getByRole("navigation", { name: "Campus tools" }));
    expect(nav.queryByRole("link", { name: "Session attendance" })).toBeNull();
    expect(nav.queryByRole("link", { name: "Competency assessments" })).toBeNull();
    expect(nav.getByRole("link", { name: "Overview" })).toBeTruthy();
  });

  it("separates personal/organization navigation from an active Super Admin Campus", () => {
    mount("GRADE_SCHOOL", "ACTIVE", [academicAdmin], "PRIMARY_ADMIN");
    const nav = within(screen.getByRole("navigation", { name: "Campus tools" }));
    expect(nav.getByRole("link", { name: "Campus setup" })).toBeTruthy();
    expect(nav.getByRole("link", { name: "Assessments & grades" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Other workspaces" })).toBeTruthy();
  });
});
