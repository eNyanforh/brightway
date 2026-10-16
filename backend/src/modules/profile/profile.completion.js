export const PROFILE_POLICY_VERSION =
  "sprint1-predefined-interests-v5";

export function evaluateProfileCompletion(profile) {
  const missing = [];

  const require = (condition, field, code) => {
    if (!condition) {
      missing.push({ field, code });
    }
  };

  require(
    profile.location.countryCode,
    "location.countryCode",
    "COUNTRY_REQUIRED",
  );

  require(
    profile.location.locality,
    "location.locality",
    "LOCALITY_REQUIRED",
  );

  require(profile.headline, "headline", "HEADLINE_REQUIRED");

  require(
    profile.careerField,
    "careerField",
    "CAREER_FIELD_REQUIRED",
  );

  require(profile.skills.length, "skills", "SKILL_REQUIRED");

  require(
    profile.interests.length,
    "interests",
    "INTEREST_REQUIRED",
  );

  require(profile.photo?.id, "photo", "PHOTO_REQUIRED");

  for (const kind of ["education", "experience"]) {
    const history = profile[kind];

    require(
      history?.mode === "NONE" ||
        (history?.mode === "RECORDS" &&
          history.records.length > 0),
      kind,
      `${kind.toUpperCase()}_DECLARATION_REQUIRED`,
    );
  }

  return {
    policyVersion: PROFILE_POLICY_VERSION,
    evaluationStatus: "POLICY_PENDING",
    complete: null,
    eligibleToRequestVerification: false,
    missing,

    unresolved: [
      { code: "REGION_APPLICABILITY_PENDING" },
      { code: "CREDENTIAL_REVIEW_NOT_IMPLEMENTED" },
      { code: "SKILL_TAXONOMY_PENDING" },
      { code: "CONTACT_VERIFICATION_POLICY_PENDING" },
      { code: "INDIVIDUAL_REVIEW_NOT_IMPLEMENTED" },
    ],
  };
}