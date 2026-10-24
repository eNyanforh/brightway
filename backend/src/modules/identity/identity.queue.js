import { randomUUID } from "node:crypto";
import { inquiryResult } from "./persona.client.js";
const error = (status, message) => Object.assign(new Error(message), { status });
const events = new Set(["inquiry.created", "inquiry.started", "inquiry.completed", "inquiry.approved", "inquiry.declined", "inquiry.failed", "inquiry.expired", "inquiry.marked-for-review"]);
function minimalEvent(event) {
  const data = event?.data, attrs = data?.attributes;
  if (data?.type !== "event" || !/^evt_[a-zA-Z0-9]+$/.test(data.id ?? "")) throw error(400, "Invalid Persona event.");
  if (!events.has(attrs?.name)) return null;
  const payload = attrs?.payload?.data;
  const referenceId = payload?.attributes?.["reference-id"], templateId = payload?.relationships?.["inquiry-template"]?.data?.id;
  // Events for other integrations need not enter BrightWay's queue.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceId ?? "") || !/^itmpl_[a-zA-Z0-9]+$/.test(templateId ?? "")) throw error(400, "Persona event is missing inquiry binding data.");
  const result = inquiryResult(payload, { referenceId, templateId });
  return { id: data.id, name: attrs.name, payload: { inquiryId: result.inquiryId, referenceId, templateId, status: result.status, updatedAt: result.updatedAt.toISOString() } };
}
function restoreEvent(job) {
  const p = job.payload;
  return { data: { id: job.id, type: "event", attributes: { name: job.eventName, payload: { data: {
    id: p.inquiryId, type: "inquiry", attributes: { status: p.status, "reference-id": p.referenceId, "updated-at": p.updatedAt },
    relationships: { "inquiry-template": { data: { id: p.templateId } } },
  } } } } };
}
export function createIdentityQueue({ prisma, identity, now = () => new Date(), saveTimeoutMs = 3000 } = {}) {
  const eligible = (timestamp) => ({ OR: [
    { state: "PENDING", availableAt: { lte: timestamp } },
    { state: "PROCESSING", leaseUntil: { lte: timestamp } },
  ] });
  return {
    // Only invoke after verifying Persona's signature against the unmodified raw body.
    async enqueue(event) {
      const item = minimalEvent(event); if (!item) return { ignored: true };
      let timer;
      try {
        // A single durable upsert; duplicate delivery cannot reset a job or change its payload.
        await Promise.race([
          prisma.identityWebhookJob.upsert({ where: { id: item.id }, create: {
            id: item.id, eventName: item.name, payload: item.payload, availableAt: now(),
          }, update: { id: item.id }, select: { id: true } }),
          new Promise((resolve, reject) => { void resolve; timer = setTimeout(() => reject(error(503, "Identity event storage is busy. Retry delivery.")), saveTimeoutMs); }),
        ]);
      } catch {
        // Never acknowledge success unless durable storage has completed. A late insert is harmless on retry.
        throw error(503, "Identity event storage is unavailable. Retry delivery.");
      } finally { clearTimeout(timer); }
      return { queued: true };
    },
    async processBatch(limit = 5) {
      if (!identity) throw Error("An identity service is required for queue processing.");
      const jobs = await prisma.identityWebhookJob.findMany({ where: eligible(now()), orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: Math.min(20, Math.max(1, limit)) });
      const counts = { processed: 0, retried: 0, failed: 0 };
      for (const job of jobs) {
        const timestamp = now(), leaseToken = randomUUID();
        const where = { id: job.id, attempts: job.attempts, ...eligible(timestamp) };
        if (job.attempts >= 10) {
          const exhausted = await prisma.identityWebhookJob.updateMany({ where, data: { state: "FAILED", leaseToken: null, leaseUntil: null, lastFailure: "RETRY_LIMIT" } });
          counts.failed += exhausted.count; continue;
        }
        const claim = await prisma.identityWebhookJob.updateMany({ where, data: { state: "PROCESSING", leaseToken,
          leaseUntil: new Date(+timestamp + 120000), attempts: { increment: 1 } } });
        if (claim.count !== 1) continue;
        try {
          // The existing service rechecks reference/template, current ownership/snapshot and provider ordering.
          // Receipt creation and the status mutation remain in the same database transaction.
          await identity.webhook(restoreEvent(job));
          const saved = await prisma.identityWebhookJob.updateMany({ where: { id: job.id, leaseToken }, data: {
            state: "DONE", processedAt: now(), leaseToken: null, leaseUntil: null, lastFailure: null,
          } });
          counts.processed += saved.count;
        } catch {
          const exhausted = job.attempts + 1 >= 10;
          await prisma.identityWebhookJob.updateMany({ where: { id: job.id, leaseToken }, data: {
            state: exhausted ? "FAILED" : "PENDING", leaseToken: null, leaseUntil: null,
            availableAt: new Date(+now() + Math.min(300, 2 ** (job.attempts + 1)) * 1000), lastFailure: "PROCESSING_FAILED",
          } });
          if (exhausted) counts.failed++; else counts.retried++;
        }
      }
      return counts;
    },
  };
}
