const human = value => String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
export function scholarshipLevelLabel(level) {
  if (level === "PHD") return "PhD";
  if (level === "TVET") return "TVET";
  return String(level).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
export function scholarshipSummary(details) {
  if (!details) return null;
  const category = details.fundingType ? human(details.fundingType) : null;
  const amount = details.value != null && details.currency
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: details.currency, maximumFractionDigits: 2 }).format(details.value)
    : null;
  return [category, amount].filter(Boolean).join(" · ") || null;
}
