export const experienceOptions = {
  EMPLOYMENT: "Paid employment",
  INTERNSHIP: "Internship",
  VOLUNTEERING: "Volunteering",
  SELF_EMPLOYMENT: "Self-employment or informal work",
};
export function historyFields(profile, kind) {
  return {
    [`${kind}Mode`]: profile[kind]?.mode || "UNSET",
    [`${kind}Records`]: JSON.stringify(profile[kind]?.records || []),
  };
}
export function historyInput(form, kind) {
  const fields =
    kind === "education"
      ? ["institution", "qualification"]
      : ["organization", "role", "type"];
  return {
    mode: form[`${kind}Mode`],
    records: JSON.parse(form[`${kind}Records`]).map((item) => ({
      ...(item.id ? { id: item.id, revision: item.revision } : {}),
      ...Object.fromEntries(
        fields.map((field) => [field, (item[field] || "").trim()]),
      ),
      startMonth: item.startMonth || "",
      endMonth: item.current ? null : item.endMonth || null,
      current: Boolean(item.current),
      description: (item.description || "").trim(),
    })),
  };
}
export function validateHistory(input) {
  if (input.mode === "RECORDS" && !input.records.length)
    return "Add a record or choose a declaration.";
  if (input.mode !== "RECORDS" && input.records.length)
    return "Resolve your existing records before choosing this declaration.";
  const now = new Date().toISOString().slice(0, 7);
  for (const record of input.records) {
    if (
      !(record.institution && record.qualification) &&
      !(record.organization && record.role && record.type)
    )
      return "Complete the institution and qualification, or organization and role.";
    if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(record.startMonth))
      return "Choose a start month and year.";
    if (
      !record.current &&
      !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(record.endMonth || "")
    )
      return "Choose an end month and year, or mark the record as current.";
    if (record.endMonth && record.endMonth < record.startMonth)
      return "End date must not precede start date.";
    if (record.startMonth > now || (record.endMonth && record.endMonth > now))
      return "Record dates must not be in the future.";
  }
  return "";
}
export function blankHistoryRecord(kind) {
  return {
    _key: crypto.randomUUID(),
    startMonth: "",
    endMonth: "",
    current: false,
    description: "",
    ...(kind === "education"
      ? { institution: "", qualification: "" }
      : { organization: "", role: "", type: "EMPLOYMENT" }),
  };
}
export function monthLabel(value) {
  if (!value) return "";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}