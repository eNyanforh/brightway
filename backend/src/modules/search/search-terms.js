// Ignore conversational filler while keeping significant terms in their order.
// Search remains deterministic and capped at eight terms; it is not an AI query.
const filler = new Set([
  "a", "an", "the", "for", "to", "of", "in", "on", "at", "with", "who",
  "that", "which", "can", "is", "are", "me", "my", "please", "show",
  "find", "search", "looking", "someone", "people", "posts", "about",
  "some", "any", "related", "near", "results", "events", "questions",
  "achievements", "organizations",
]);

export function prefixSearchQuery(q) {
  const words = q.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  if (words.join("").length < 2 || words.length > 8) return null;
  const meaningful = words.filter(word => !filler.has(word.toLowerCase()));
  const selected = meaningful.length ? meaningful : words;
  return selected.map(word => word + ":*").join(" & ");
}
