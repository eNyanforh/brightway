import test from "node:test";
import assert from "node:assert/strict";
import { verifiedCredentials } from "../src/modules/notifications/notifications.service.js";

test("public credential projection includes only verified current revisions", async () => {
  const where = [];
  const tx = {
    credentialReview: {
      async findMany(query) {
        where.push(["review", query]);
        return [
          { kind: "education", recordId: "edu-approved", revision: 2, status: "VERIFIED", issuerName: "Starz University" },
          { kind: "education", recordId: "edu-old", revision: 1, status: "VERIFIED", issuerName: "Old Issuer" },
          { kind: "experience", recordId: "exp-approved", revision: 3, status: "VERIFIED", issuerName: null },
          { kind: "experience", recordId: "exp-action", revision: 1, status: "ACTION_REQUIRED", issuerName: null },
        ];
      },
    },
    educationRecord: {
      async findMany(query) {
        where.push(["education", query]);
        return [
          { id: "edu-approved", revision: 2, status: "VERIFIED", qualification: "BSc",
            institution: "Starz University", startMonth: "2024-01", endMonth: null, current: true },
          { id: "edu-old", revision: 2, status: "VERIFIED", qualification: "Old Credential",
            institution: "Unapproved University", startMonth: "2023-01", endMonth: "2023-12", current: false },
        ];
      },
    },
    experienceRecord: {
      async findMany(query) {
        where.push(["experience", query]);
        return [
          { id: "exp-approved", revision: 3, status: "VERIFIED", role: "Developer",
            organization: "Software Lab", startMonth: "2025-01", endMonth: null, current: true },
          { id: "exp-action", revision: 1, status: "ACTION_REQUIRED", role: "Claim",
            organization: "Invalid Record", startMonth: "2021-01", endMonth: "2022-01", current: false },
        ];
      },
    },
  };
  const rows = await verifiedCredentials(tx, "profile-1");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.id), ["edu-approved", "exp-approved"]);
  assert.equal(rows[0].verifiedBy, "Starz University");
  assert.equal(rows[1].verifiedBy, "BrightWay");
  for (const row of rows) {
    assert.equal(Object.hasOwn(row, "status"), false);
    assert.equal(Object.hasOwn(row, "reviewerId"), false);
    assert.equal(Object.hasOwn(row, "note"), false);
    assert.equal(Object.hasOwn(row, "evidence"), false);
  }
  for (const [, query] of where) {
    assert.equal(query.where.profileId, "profile-1");
    assert.equal(query.where.status, "VERIFIED");
    assert.ok(query.take <= 60);
  }
});
