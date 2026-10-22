import { randomUUID } from "node:crypto";
import { createIdentityService } from "../src/modules/identity/identity.service.js";
export function identityFixture() {
  let date = new Date("2026-10-22T18:00:00Z"), failWrite = false, providerFails = false;
  const state = { account: ["owner", "other"].map((id) => ({ id, status: "ACTIVE", emailVerifiedAt: date,
    person: { firstName: "Sample", middleName: null, lastName: id, birthDate: new Date("2000-01-01"), profile: { photoId: "photo" } } })),
    identityVerification: [], identityInquiry: [], identityWebhookReceipt: [] };
  const db = {};
  const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  for (const model of Object.keys(state)) db[model] = {
    async findUnique({ where }) { return structuredClone(state[model].find((row) => matches(row, where)) ?? null); },
    async create({ data }) {
      if (failWrite && model === "identityWebhookReceipt") throw Error("receipt storage failed");
      if (model === "identityInquiry" && !state.identityVerification.some((r) => r.accountId === data.accountId)) throw Error("foreign key");
      const row = { id: randomUUID(), providerStatus: "creating", inquiryId: null, providerUpdatedAt: null, environment: "sandbox", createdAt: date, ...structuredClone(data) };
      state[model].push(row); return structuredClone(row);
    },
    async update({ where, data }) { const row = state[model].find((r) => matches(r, where)); if (!row) throw Error("missing row"); Object.assign(row, structuredClone(data)); return structuredClone(row); },
    async updateMany({ where, data }) { const rows = state[model].filter((r) => matches(r, where)); rows.forEach((r) => Object.assign(r, structuredClone(data))); return { count: rows.length }; },
    async upsert({ where, create, update }) { const row = await this.findUnique({ where }); return row ? this.update({ where, data: update }) : this.create({ data: create }); },
  };
  let chain = Promise.resolve();
  db.$transaction = (fn) => { const run = chain.then(async () => { const before = structuredClone(state); try { return await fn(db); } catch (e) { Object.assign(state, before); throw e; } }); chain = run.catch(() => {}); return run; };
  const calls = [], inquiries = new Map();
  const persona = { templateId: "itmpl_sandbox", check() {},
    async create(attempt) {
      calls.push(structuredClone(attempt));
      if (!inquiries.has(attempt.idempotencyKey)) inquiries.set(attempt.idempotencyKey, { inquiryId: `inq_${inquiries.size + 1}`, status: "created", updatedAt: date });
      if (providerFails) throw Object.assign(Error("Provider unavailable"), { status: 503 });
      return structuredClone(inquiries.get(attempt.idempotencyKey));
    },
    async retrieve(attempt) { return structuredClone(inquiries.get(attempt.idempotencyKey)); },
  };
  const service = createIdentityService({ prisma: db, persona, now: () => date });
  function event(attempt, status, id = `evt_${randomUUID().replaceAll("-", "")}`, updatedAt = date) {
    return { data: { type: "event", id, attributes: { name: status === "needs_review" ? "inquiry.marked-for-review" : `inquiry.${status}`, payload: { data: {
      id: attempt.inquiryId, type: "inquiry", attributes: { status, "reference-id": attempt.referenceId, "updated-at": updatedAt.toISOString(),
        fields: { "name-first": { value: "Private provider name" } } }, relationships: { "inquiry-template": { data: { id: attempt.templateId } } },
    } } } } };
  }
  return { db, state, service, persona, inquiries, calls, event, now: () => date,
    advance: (ms) => { date = new Date(+date + ms); }, failReceipt: () => { failWrite = true; },
    failProvider: (value = true) => { providerFails = value; } };
}
