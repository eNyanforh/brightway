import options from "../../../../shared/profile-interests.json" with {
  type: "json",
};

const catalog = new Map(
  options.map((label) => [label.toLowerCase(), label]),
);

// Existing custom interests can be retained or removed.
// New interests must come from the predefined list.
export function normalizeInterests(values, previous = []) {
  const existing = new Set(previous);

  return values.map((value) => {
    const canonical = catalog.get(value.toLowerCase());

    if (canonical) return canonical;
    if (existing.has(value)) return value;

    throw Object.assign(
      new Error("Choose interests from the predefined list."),
      { status: 400 },
    );
  });
}