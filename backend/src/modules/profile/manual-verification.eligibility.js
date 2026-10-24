// Evaluate server-owned profile data only. This is not an approval or submission.
export function evaluateManualVerificationEligibility(profile, profileComplete) {
  const hasVerified = (history) => history?.mode === "RECORDS" &&
    Array.isArray(history.records) &&
    history.records.some((record) => record.status === "VERIFIED");
  const checks = [
    { code: "PROFILE_COMPLETE_REQUIRED", label: "100% complete profile", satisfied: profileComplete === true },
    { code: "VERIFIED_EDUCATION_REQUIRED", label: "At least one verified education record", satisfied: Boolean(hasVerified(profile.education)) },
    { code: "VERIFIED_EXPERIENCE_REQUIRED", label: "At least one verified experience record", satisfied: Boolean(hasVerified(profile.experience)) },
  ];
  return {
    requirementsMet: checks.every((check) => check.satisfied),
    checks,
    missing: checks.filter((check) => !check.satisfied).map(({ code }) => ({ code })),
  };
}
