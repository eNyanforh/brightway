import { formFromProfile } from "./profile-form";
export const credentialLabels = { DRAFT: "Not submitted", SUBMITTED: "Submitted", IN_REVIEW: "In review", VERIFIED: "Verified credential", ACTION_REQUIRED: "Action required", UNABLE_TO_VERIFY: "Unable to verify", FALSE_CREDENTIAL: "False credential" };
export function rebaseCredentialProfile(previous, profile) {
  if (!previous || previous.profile.version >= profile.version) return previous;
  const oldSaved = formFromProfile(previous.profile), form = formFromProfile(profile);
  for (const key of Object.keys(form)) if (previous.form[key] !== oldSaved[key]) form[key] = previous.form[key];
  return { ...previous, profile, form, notice: "Credential submitted for review.", error: null };
}
