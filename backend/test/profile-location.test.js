import test from "node:test";
import assert from "node:assert/strict";
import { canonicalLiberiaCounty, liberiaCounties } from "../../shared/profile-location.mjs";
import { profileView } from "../src/modules/profile/profile.service.js";
import { profilePatchSchema } from "../src/modules/profile/profile.schema.js";

function completed(location = {}) {
  return profileView({
    version: 8, countryCode: "LR", locality: "Monrovia", region: "Montserrado", ...location,
    headline: "Student", careerFieldMode: "EXPLORING", skills: ["Communication"], interests: ["Technology"],
    photo: { id: "photo" }, educationMode: "NONE", experienceMode: "NONE",
    person: { phoneNumber: "+231770000000", account: { email: "owner@example.com", emailVerifiedAt: new Date("2026-01-01") } },
  });
}

test("Liberian profiles require a recognized county even when every other profile requirement is met", () => {
  for (const region of [null, "", "  ", "Not a county", "Greater Accra", "<script>"]) {
    const result = completed({ region }).completion;
    assert.equal(result.complete, false);
    assert.equal(result.evaluationStatus, "INCOMPLETE");
    assert.deepEqual(result.missing, [{ field: "location.region", code: "COUNTY_REQUIRED" }]);
    assert.equal(result.checks.find((item) => item.code === "COUNTY_REQUIRED").editor, "intro");
  }
});

test("all fifteen counties and common legacy spellings satisfy the requirement without rewriting saved values", () => {
  assert.equal(liberiaCounties.length, 15);
  assert.equal(new Set(liberiaCounties).size, 15);
  for (const region of [...liberiaCounties, " montserrado county ", "RIVERCESS", "RiverCess County", "grand   cape mount"]) {
    const profile = completed({ region });
    assert.equal(profile.location.region, region);
    assert.equal(profile.completion.complete, true);
    assert.equal(profile.completion.evaluationStatus, "COMPLETE");
    assert.equal(profile.completion.profileVersion, 8);
    assert.deepEqual(profile.completion.missing, []);
    assert.equal(profile.completion.eligibleToRequestVerification, false);
    assert(!profile.completion.unresolved.some((item) => item.code === "REGION_APPLICABILITY_PENDING"));
  }
  assert.equal(canonicalLiberiaCounty("Rivercess County"), "River Cess");
});

test("regions remain optional for other countries, including when the optional field is empty", () => {
  for (const countryCode of ["GH", "US", "GB", "SG", "KE"]) {
    for (const region of [null, "", "A user-entered region"]) {
      const result = completed({ countryCode, region }).completion;
      assert.equal(result.complete, true);
      assert(!result.checks.some((item) => item.code === "COUNTY_REQUIRED"));
      assert.equal(result.eligibleToRequestVerification, false);
    }
  }
  const missingCountry = completed({ countryCode: null, region: null }).completion;
  assert.deepEqual(missingCountry.missing, [{ field: "location.countryCode", code: "COUNTRY_REQUIRED" }]);
});

test("draft validation allows a missing county and legacy location text but rejects injected completion flags", () => {
  for (const region of [null, "", "Previously saved legacy region"]) {
    assert.equal(profilePatchSchema.safeParse({ expectedVersion: 0, changes: { location: { countryCode: "LR", region } } }).success, true);
  }
  for (const location of [{ countryCode: "LR", countyRequired: false }, { countryCode: "LR", complete: true }]) {
    assert.equal(profilePatchSchema.safeParse({ expectedVersion: 0, changes: { location } }).success, false);
  }
});