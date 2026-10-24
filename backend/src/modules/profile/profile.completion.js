import { evaluateManualVerificationEligibility } from "./manual-verification.eligibility.js";
import { canonicalLiberiaCounty, requiresCounty } from "../../../../shared/profile-location.mjs";
import { isPhoneNumber } from "./profile-contact.js";
export const PROFILE_POLICY_VERSION = "sprint1-manual-verification-eligibility-v11";

// Profile information and trust/review eligibility remain separate concepts.
export function evaluateProfileCompletion(profile) {
  const checks = [];
  const check = (condition, field, code, label, editor) => {
    checks.push({ field, code, label, editor, satisfied: Boolean(condition) });
  };
  check(profile.location?.countryCode, "location.countryCode", "COUNTRY_REQUIRED", "Country or territory", "intro");
  if (requiresCounty(profile.location?.countryCode)) {
    check(canonicalLiberiaCounty(profile.location?.region), "location.region", "COUNTY_REQUIRED", "County (Liberia)", "intro");
  }
  check(profile.location?.locality, "location.locality", "LOCALITY_REQUIRED", "City or locality", "intro");
  check(profile.headline, "headline", "HEADLINE_REQUIRED", "Professional headline", "intro");
  check(profile.careerField, "careerField", "CAREER_FIELD_REQUIRED", "Career direction", "career");
  check(profile.skills?.length, "skills", "SKILL_REQUIRED", "At least one skill", "skills");
  check(profile.interests?.length, "interests", "INTEREST_REQUIRED", "At least one interest", "interests");
  check(profile.photo?.id, "photo", "PHOTO_REQUIRED", "Profile picture", "photo");
  check(isPhoneNumber(profile.contact?.phoneNumber), "contact.phoneNumber", "PHONE_REQUIRED", "Phone number", "contact");
  const verifiedAt = profile.contact?.emailVerifiedAt;
  const verified = Boolean(profile.contact?.email && verifiedAt && Number.isFinite(new Date(verifiedAt).getTime()));
  check(verified, "contact.emailVerifiedAt", "EMAIL_VERIFICATION_REQUIRED", "Verified email", "email");
  for (const kind of ["education", "experience"]) {
    const history = profile[kind];
    check(history?.mode === "NONE" || (history?.mode === "RECORDS" && history.records.length > 0),
      kind, `${kind.toUpperCase()}_DECLARATION_REQUIRED`, kind === "education" ? "Education history or declaration" : "Experience history or declaration", kind);
  }
  const missing = checks.filter((item) => !item.satisfied).map(({ field, code }) => ({ field, code }));
  return {
    policyVersion: PROFILE_POLICY_VERSION,
    profileVersion: profile.version ?? 0,
    evaluationStatus: missing.length ? "INCOMPLETE" : "COMPLETE",
    complete: missing.length === 0,
    knownRequirementsComplete: missing.length === 0,
    // Submission remains disabled until the private manual-review workflow is installed.
    eligibleToRequestVerification: false,
    manualVerificationEligibility: evaluateManualVerificationEligibility(profile, missing.length === 0),
    checks,
    missing,
    unresolved: [
      { code: "INDIVIDUAL_REVIEW_NOT_IMPLEMENTED" },
    ],
  };
}
