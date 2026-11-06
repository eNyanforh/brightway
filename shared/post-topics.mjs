export const MAX_POST_TOPICS = 5;
export const MAX_POST_TOPIC_LENGTH = 32;

export function normalizePostTopic(value) {
  const topic = value.normalize("NFC").trim().replace(/^(?:#\s*)+/u, "").replace(/\s+/gu, " ");
  if (topic.length > MAX_POST_TOPIC_LENGTH || !/[\p{L}\p{N}]/u.test(topic) || /\p{C}/u.test(topic)) return null;
  return topic;
}
