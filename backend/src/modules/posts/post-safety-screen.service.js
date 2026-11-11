// Moderation is a pre-publication safety signal, not an approval decision.
// Every new or edited member post remains PENDING until authorized staff review.
// If the provider is absent, unreachable, or returns an invalid response,
// this service records an explicit unavailable signal; no content becomes public.
const model = "omni-moderation-latest";
const endpoint = "https://api.openai.com/v1/moderations";

export function moderationText(post) {
  const parts = [post.type, post.body, ...(post.tags || [])];
  if (post.type === "QUESTION" && post.questionDetails) {
    parts.push(post.questionDetails.title, post.questionDetails.intent);
  }
  if (post.type === "EVENT" && post.eventDetails) {
    parts.push(post.eventDetails.title, post.eventDetails.venue);
  }
  // Do not send event join URLs, private application data, or member contacts.
  return parts.filter(value => typeof value === "string" && value.trim())
    .join("\n").slice(0, 5000);
}

export function createPostSafetyScreen({
  apiKey = process.env.OPENAI_API_KEY,
  request = fetch,
  timeoutMs = 4000,
} = {}) {
  return async function screen(post) {
    if (typeof apiKey !== "string" || !apiKey.trim())
      return { moderationScreenStatus: "NOT_CONFIGURED", moderationFlags: [] };
    try {
      const response = await request(endpoint, {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: moderationText(post) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw Error("Moderation provider unavailable.");
      const data = await response.json();
      const result = data?.results?.[0];
      if (!result || typeof result.flagged !== "boolean" || !result.categories ||
        typeof result.categories !== "object") throw Error("Invalid moderation result.");
      return {
        moderationScreenStatus: result.flagged ? "FLAGGED" : "CLEAR",
        moderationFlags: Object.entries(result.categories)
          .filter(([name, flagged]) => flagged === true && /^[a-z/-]{1,40}$/.test(name))
          .map(([name]) => name).slice(0, 12),
      };
    } catch {
      // Do not log submitted text, provider messages, or API credentials.
      return { moderationScreenStatus: "UNAVAILABLE", moderationFlags: [] };
    }
  };
}
