import options from "../../../../shared/profile-skills.json" with { type: "json" };

const catalog = new Map(options.map((label) => [label.toLowerCase(), label]));

// Keep existing custom skills on their own profile; new skills use the catalog.
export function normalizeSkills(values, previous = []) {
  const existing = new Set(previous);
  return values.map((value) => {
    const canonical = catalog.get(value.toLowerCase());
    if (canonical) return canonical;
    if (existing.has(value)) return value;
    throw Object.assign(new Error("Choose skills from the predefined list."), { status: 400 });
  });
}
