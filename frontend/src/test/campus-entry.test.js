import { describe, expect, it } from "vitest";
import { organizationEntryPath } from "../components/organizations/campus-entry";

const id = "55555555-5555-4555-8555-555555555555";

describe("primary institution workspace entry", () => {
  it("opens Campus first for a school primary administrator", () => {
    expect(organizationEntryPath({ id, type: "SCHOOL", role: "PRIMARY_ADMIN" })).toBe(`/campus/${id}`);
  });
  it("opens Campus first for an approved TVET administrator", () => {
    expect(organizationEntryPath({ id, type: "COMPANY", offersTraining: true, role: "PRIMARY_ADMIN" })).toBe(`/campus/${id}`);
  });
  it("retains the organization workspace for ordinary school staff without bypassing Campus permissions", () => {
    expect(organizationEntryPath({ id, type: "SCHOOL", role: "STAFF" })).toBe(`/organization-workspace/${id}`);
  });
  it("retains the organization workspace for primary administrators of non-Campus organizations", () => {
    expect(organizationEntryPath({ id, type: "NGO", offersTraining: false, role: "PRIMARY_ADMIN" })).toBe(`/organization-workspace/${id}`);
  });
});
