// Ignore conversational filler while keeping significant terms in their order.
// Search remains deterministic and capped at eight terms; it is not an AI query.
const filler = new Set([
  "a", "an", "the", "for", "to", "of", "in", "on", "at", "with", "who",
  "that", "which", "can", "is", "are", "me", "my", "please", "show",
  "find", "search", "looking", "someone", "people", "posts", "about",
  "some", "any", "related", "near", "results", "events", "questions",
  "achievements", "organizations", "named", "called", "name", "person",
  "user", "member", "friend", "whose", "i", "am", "want", "need", "you", "see",
]);

export function prefixSearchQuery(q) {
  const words = q.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  if (words.join("").length < 2 || words.length > 8) return null;
  const meaningful = words.filter(word => !filler.has(word.toLowerCase()));
  const selected = meaningful.length ? meaningful : words;
  return selected.map(word => word + ":*").join(" & ");
}


// Fuzzy matching is for public names and handles, never emails or arbitrary
// pasted identifiers. Two-character queries use the existing prefix index.
export function directoryFuzzyTerm(q) {
  if (typeof q !== "string" || /[\p{L}\p{N}][^\s@]*@[^\s]+\.[^\s]+/iu.test(q)) return null;
  const words = (q.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])
    .filter(word => !filler.has(word.toLowerCase()));
  if (!words.length || words.length > 3) return null;
  const term = words.join(" ").toLowerCase();
  return term.length >= 3 && term.length <= 48 ? term : null;
}
