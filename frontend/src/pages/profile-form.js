export function formFromProfile(profile) {
  return {
    headline: profile.headline || "",
    bio: profile.bio || "",
    countryCode: profile.location?.countryCode || "",
    region: profile.location?.region || "",
    locality: profile.location?.locality || "",
    careerMode: profile.careerField?.mode || "",
    careerLabel: profile.careerField?.label || "",
    careerGoals: profile.careerGoals || "",
    skills: (profile.skills || []).join("\n"),
    interests: (profile.interests || []).join("\n"),
  };
}

export const parseEntries = (text) =>
  text
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

export function changesFromForm(form, profile) {
  const current = {
    headline: form.headline.trim() || null,
    bio: form.bio.trim() || null,
    location: {
      countryCode: form.countryCode || null,
      region: form.region.trim() || null,
      locality: form.locality.trim() || null,
    },
    careerField:
      form.careerMode === "SPECIFIED"
        ? { mode: "SPECIFIED", label: form.careerLabel.trim() }
        : form.careerMode === "EXPLORING"
          ? { mode: "EXPLORING" }
          : null,
    careerGoals: form.careerGoals.trim() || null,
    skills: parseEntries(form.skills),
    interests: parseEntries(form.interests),
  };
  const changes = {};
  for (const [key, value] of Object.entries(current)) {
    if (key === "location") {
      const location = {};
      for (const [field, text] of Object.entries(value)) {
        if (text !== (profile.location?.[field] ?? null))
          location[field] = text;
      }
      if (Object.keys(location).length) changes.location = location;
    } else if (JSON.stringify(value) !== JSON.stringify(profile[key] ?? null))
      changes[key] = value;
  }
  return changes;
}

export function validateForm(form) {
  if (form.careerMode === "SPECIFIED" && !form.careerLabel.trim())
    return "Enter your career field or choose Exploring.";
  for (const name of ["skills", "interests"]) {
    const values = parseEntries(form[name]);
    if (values.length > 20) return `Add up to 20 ${name}.`;
    if (values.some((value) => value.length > 80))
      return `Keep each entry in ${name} within 80 characters.`;
    if (
      new Set(values.map((value) => value.toLowerCase())).size !== values.length
    )
      return `Remove duplicate entries from ${name}.`;
  }
  return "";
}

export const editorFields = {
  intro: ["headline", "countryCode", "region", "locality"],
  about: ["bio"],
  career: ["careerMode", "careerLabel", "careerGoals"],
  skills: ["skills"],
  interests: ["interests"],
};
export function createProfileDraft(profile) {
  return {
    profile,
    form: formFromProfile(profile),
    busy: false,
    editor: null,
    lastEditor: "intro",
    error: null,
    notice: "",
  };
}
export function formForSection(draft, section) {
  const form = formFromProfile(draft.profile);
  for (const field of editorFields[section]) form[field] = draft.form[field];
  return form;
}
export function mergeSavedSection(previous, profile, section) {
  const saved = formFromProfile(previous.profile);
  const form = formFromProfile(profile);
  // Retain edits in other sections when this section commits successfully.
  for (const field of Object.keys(form)) {
    if (
      !editorFields[section].includes(field) &&
      previous.form[field] !== saved[field]
    )
      form[field] = previous.form[field];
  }
  const normalized = formFromProfile(profile);
  const remaining = Object.entries(editorFields).find(([, fields]) =>
    fields.some((field) => form[field] !== normalized[field]),
  );
  return {
    ...previous,
    profile,
    form,
    editor: null,
    lastEditor: remaining?.[0] || section,
    error: null,
    notice: "Profile saved.",
  };
}