import assert from "node:assert/strict";
import test from "node:test";
import {
  withProfileOrganizationAvatars,
  withCredentialOrganizationAvatars,
} from "../src/modules/profile/profile-organizations.js";

test("official organization avatars replace generic profile symbols for uniquely matched names", async () => {
  const calls = [];
  const db = {
    organization: {
      async findMany(options) {
        calls.push(options);
        return [
          { id: "school-one", name: "Starz University", type: "SCHOOL", offersTraining: true, profilePhotoId: "school-photo" },
          { id: "company-one", name: "Example Labs", type: "COMPANY", offersTraining: false, profilePhotoId: "company-photo" },
        ];
      },
    },
  };
  const profile = {
    education: { mode: "RECORDS", records: [
      { id: "edu1", institution: "starz university", qualification: "BSc" },
      { id: "edu2", institution: "Unknown School", qualification: "Diploma" },
      { id: "edu3", institution: "Example Labs", qualification: "Certificate" },
    ] },
    experience: { mode: "RECORDS", records: [
      { id: "work1", organization: "Example Labs", role: "Developer" },
      { id: "work2", organization: "Starz University", role: "Tutor" },
    ] },
  };
  const result = await withProfileOrganizationAvatars(db, profile);
  assert.deepEqual(result.education.records[0].organizationAvatar, {
    id: "school-one", name: "Starz University",
    photoUrl: "/api/v1/organizations/school-one/photo/school-photo",
  });
  assert.equal(result.education.records[1].organizationAvatar, undefined);
  assert.equal(result.education.records[2].organizationAvatar, undefined,
    "a company not authorized to provide training cannot be rendered as a school");
  assert.equal(result.experience.records[0].organizationAvatar.id, "company-one");
  assert.equal(result.experience.records[1].organizationAvatar.id, "school-one");
  assert.equal(profile.education.records[0].organizationAvatar, undefined, "original profile remains unchanged");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.status, "ACTIVE");
  assert.equal(calls[0].where.request.status, "APPROVED");
  assert.deepEqual(calls[0].where.profileReadyAt, { not: null });
  assert.deepEqual(calls[0].where.profilePhotoId, { not: null });
});

test("ambiguous organizations are never associated with a member record", async () => {
  const db = { organization: { findMany: async () => [
    { id: "one", name: "Same School", type: "SCHOOL", offersTraining: true, profilePhotoId: "one-photo" },
    { id: "two", name: "same school", type: "SCHOOL", offersTraining: true, profilePhotoId: "two-photo" },
  ] } };
  const records = [{ kind: "education", organization: "Same School", title: "BSc" }];
  assert.deepEqual(await withCredentialOrganizationAvatars(db, records), records);
});

test("credential verification status is preserved when displaying an official organization", async () => {
  const db = { organization: { findMany: async () => [
    { id: "org", name: "Research Center", type: "NGO", offersTraining: false, profilePhotoId: "photo" },
  ] } };
  const original = [{ id: "cred", kind: "experience", organization: "Research Center", verifiedBy: "BrightWay" }];
  const records = await withCredentialOrganizationAvatars(db, original);
  assert.equal(records[0].verifiedBy, "BrightWay");
  assert.equal(records[0].organizationAvatar.id, "org");
});
