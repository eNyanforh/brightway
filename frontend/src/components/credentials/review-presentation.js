export const reviewDate = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not available";
export const applicantName = row => [row.profile?.person?.firstName, row.profile?.person?.middleName, row.profile?.person?.lastName].filter(Boolean).join(" ") || "Applicant";
export const claimTitle = review => {
  const claim = review.attempts?.at(-1)?.snapshot || {};
  return claim.qualification || claim.role || claim.title || (review.kind === "experience" ? "Experience claim" : "Education claim");
};
const labels = { institution: "Institution", qualification: "Qualification", fieldOfStudy: "Field of study", startMonth: "Start date", endMonth: "End date", current: "Currently active", description: "Additional information", type: "Experience type", organization: "Organization", role: "Role" };
const types = { EMPLOYMENT: "Paid employment", INTERNSHIP: "Internship", VOLUNTEERING: "Volunteering", SELF_EMPLOYMENT: "Self-employment or informal work" };
export function claimFields(snapshot = {}) {
  return Object.entries(snapshot).filter(([key]) => !["id", "revision", "status"].includes(key)).map(([key, value]) => {
    let text = value === null || value === "" ? "Not provided" : typeof value === "boolean" ? value ? "Yes" : "No" : typeof value === "object" ? "Not provided" : String(value);
    if (["startMonth", "endMonth"].includes(key) && /^\d{4}-\d{2}$/.test(text)) text = new Date(`${text}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
    if (key === "type") text = types[value] || text;
    return [labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase()), text];
  });
}
