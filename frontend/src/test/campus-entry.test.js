import { describe, expect, it } from "vitest";
import { organizationEntryPath } from "../components/organizations/campus-entry";

const id = "55555555-5555-4555-8555-555555555555";
describe("institution entry after Virtual Campus retirement", () => {
  for (const organization of [
    { id, type: "SCHOOL", role: "PRIMARY_ADMIN" },
    { id, type: "COMPANY", offersTraining: true, role: "PRIMARY_ADMIN" },
    { id, type: "SCHOOL", role: "STAFF" },
    { id, type: "NGO", offersTraining: false, role: "PRIMARY_ADMIN" },
  ]) {
    it(`opens the standard organization workspace for ${organization.type} ${organization.role}`, () => {
      expect(organizationEntryPath(organization)).toBe(`/organization-workspace/${id}`);
    });
  }
});
