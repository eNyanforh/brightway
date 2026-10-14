export const PROFILE_POLICY_VERSION = "sprint1-photo-immediate-v3";

// Known draft minimums are checked, but unresolved trust rules cannot pass.
export function evaluateProfileCompletion(profile) {
  const missing = [];
  const require = (condition, field, code) => {
    if (!condition) missing.push({ field, code });
  };
  require(profile.location.countryCode, "location.countryCode", "COUNTRY_REQUIRED");
  require(profile.location.locality, "location.locality", "LOCALITY_REQUIRED");
  require(profile.headline, "headline", "HEADLINE_REQUIRED");
  require(profile.careerField, "careerField", "CAREER_FIELD_REQUIRED");
  require(profile.skills.length, "skills", "SKILL_REQUIRED");
  require(profile.interests.length, "interests", "INTEREST_REQUIRED");
  require(profile.photo?.id, "photo", "PHOTO_REQUIRED");

  return {
    policyVersion: PROFILE_POLICY_VERSION,
    evaluationStatus: "POLICY_PENDING",
    complete: null,
    eligibleToRequestVerification: false,
    missing,
    unresolved: [
      { code: "REGION_APPLICABILITY_PENDING" },
      { code: "EDUCATION_APPLICABILITY_PENDING" },
      { code: "EXPERIENCE_RECORDS_NOT_IMPLEMENTED" },
      { code: "SKILL_INTEREST_TAXONOMY_PENDING" },
      { code: "CONTACT_VERIFICATION_POLICY_PENDING" },
      { code: "INDIVIDUAL_REVIEW_NOT_IMPLEMENTED" },
    ],
  };
}