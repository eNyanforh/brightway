const fail = () => Object.assign(new Error("Identity verification is temporarily unavailable."), { status: 503 });
const statuses = new Set(["created", "pending", "completed", "approved", "declined", "failed", "expired", "needs_review"]);
export function inquiryResult(data, expected) {
  const attributes = data?.attributes;
  const template = data?.relationships?.["inquiry-template"]?.data?.id;
  const updatedAt = new Date(attributes?.["updated-at"]);
  if (data?.type !== "inquiry" || !/^inq_[a-zA-Z0-9]+$/.test(data.id ?? "") ||
      (expected.inquiryId && data.id !== expected.inquiryId) ||
      attributes?.["reference-id"] !== expected.referenceId || template !== expected.templateId ||
      !statuses.has(attributes?.status) || !attributes?.["updated-at"] || !Number.isFinite(+updatedAt)) throw fail();
  // Deliberately discard names, birthdates, image URLs and every other provider field.
  return { inquiryId: data.id, status: attributes.status, updatedAt };
}
export function createPersonaClient({ apiKey = process.env.PERSONA_API_KEY,
  templateId = process.env.PERSONA_INQUIRY_TEMPLATE_ID,
  environment = process.env.PERSONA_ENVIRONMENT ?? "sandbox",
  nodeEnv = process.env.NODE_ENV, fetcher = fetch } = {}) {
  function check() {
    if (nodeEnv === "production" || environment !== "sandbox" || !/^persona_sandbox_[a-zA-Z0-9_-]+$/.test(apiKey ?? "") ||
        !/^itmpl_[a-zA-Z0-9]+$/.test(templateId ?? "")) throw fail();
  }
  async function request(path, options = {}) {
    check();
    try {
      const response = await fetcher(`https://api.withpersona.com/api/v1/${path}`, {
        ...options, redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
          "Persona-Version": "2026-09-29", "Key-Inflection": "kebab", ...options.headers },
      });
      if (!response.ok) throw fail();
      return (await response.json()).data;
    } catch { throw fail(); }
  }
  return {
    check, templateId, environment: "sandbox",
    async create(attempt) {
      const data = await request("inquiries", { method: "POST", headers: { "Idempotency-Key": attempt.idempotencyKey },
        body: JSON.stringify({ data: { attributes: { "inquiry-template-id": attempt.templateId, "reference-id": attempt.referenceId } } }) });
      return inquiryResult(data, attempt);
    },
    async retrieve(attempt) {
      if (!/^inq_[a-zA-Z0-9]+$/.test(attempt.inquiryId ?? "")) throw fail();
      return inquiryResult(await request(`inquiries/${attempt.inquiryId}`), attempt);
    },
  };
}
