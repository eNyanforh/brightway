export const MAX_POST_TOPICS = 5;
export const MAX_POST_TOPIC_LENGTH = 32;

// One subject taxonomy for achievements, events and community questions.
export const POST_SUBJECT_CATEGORIES = Object.freeze([
  "Coding", "Art", "Education", "Technology", "Science", "Design",
  "Business", "Engineering", "Health", "Research", "Entrepreneurship", "Community",
]);

export function normalizePostTopic(value) {
  const topic = value.normalize("NFC").trim().replace(/^(?:#\s*)+/u, "").replace(/\s+/gu, " ");
  if (topic.length > MAX_POST_TOPIC_LENGTH || !/[\p{L}\p{N}]/u.test(topic) || /\p{C}/u.test(topic)) return null;
  return topic;
}
