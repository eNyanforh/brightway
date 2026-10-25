import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { createManualIdentityReviewService } from "../src/modules/manual-identity/manual-identity-review.service.js";
import { reviewPolicy, MANUAL_REVIEW_CONSENT } from "../src/modules/manual-identity/manual-identity.policy.js";
export function manualReviewFixture() {
  let date = new Date("2026-10-23T12:00:00Z"), auditFails = false;
  const ownerId = randomUUID(), reviewerId = randomUUID(), otherId = randomUUID(), personId = randomUUID(), sessionId = randomUUID();
  const modelNames = ["account", "profile", "session", "mfaFactor", "manualIdentityEvidence", "manualIdentityUploadBudget", "manualIdentityRequest", "manualIdentityAttempt", "manualIdentityAudit", "manualIdentityReviewer"];
  const state = Object.fromEntries(modelNames.map((name) => [name, []]));
  state.account.push({ id: ownerId, identityRevision: 0, personId, status: "ACTIVE", username: "owner", email: "owner@example.invalid", emailVerifiedAt: date,
    person: { id: personId, firstName: "Sample", lastName: "Owner", middleName: null, birthDate: new Date("2000-01-01"), gender: "MALE", identityRevision: 0 } },
    { id: reviewerId, personId: randomUUID(), status: "ACTIVE", username: "reviewer", emailVerifiedAt: date },
    { id: otherId, personId: randomUUID(), status: "ACTIVE", username: "other", emailVerifiedAt: date });
  state.profile.push({ id: randomUUID(), identityRevision: 0, personId, version: 1, countryCode: "US", locality: "City", headline: "Developer", careerFieldMode: "EXPLORING",
    skills: ["JavaScript"], interests: ["Technology"], photo: { id: randomUUID() }, person: { phoneNumber: "+231770000000", account: { email: "owner@example.invalid", emailVerifiedAt: date } },
    educationMode: "RECORDS", experienceMode: "RECORDS", educationRecords: [{ id: randomUUID(), revision: 1, status: "VERIFIED" }], experienceRecords: [{ id: randomUUID(), revision: 1, status: "VERIFIED" }] });
  state.manualIdentityReviewer.push({ accountId: reviewerId, enabled: true });
  state.mfaFactor.push({ accountId: reviewerId, enabled: true, version: 1 });
  state.session.push({ id: sessionId, accountId: reviewerId, expiresAt: new Date(+date + 7 * 86400000), mfaVerifiedAt: date, mfaVersion: 1 });
  const clone = (value) => structuredClone(value);
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((part) => matches(row, part));
      if (key === "requestId_idempotencyKey") return matches(row, value);
      if (value instanceof Date) return +row[key] === +value;
      if (value && typeof value === "object") {
        if ("in" in value) return value.in.includes(row[key]);
        if ("not" in value) return row[key] !== value.not;
        if ("gte" in value) return row[key] >= value.gte;
        if ("gt" in value) return row[key] > value.gt;
        if ("lt" in value) return row[key] < value.lt;
        if ("lte" in value) return row[key] <= value.lte;
      }
      return row[key] === value;
    });
  }
  function change(row, data) {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value instanceof Prisma.NullTypes.DbNull ? null : value && typeof value === "object" && "increment" in value ? row[key] + value.increment : clone(value);
    }
    row.updatedAt = date;
  }
  const db = {};
  for (const model of modelNames) {
    const project = (row, select) => Array.isArray(row) ? row.map((item) => project(item, select)) : !row ? null : select ? Object.fromEntries(Object.entries(select).map(([key, value]) => [key, typeof value === "object" && value.select ? project(row[key], value.select) : clone(row[key])])) : clone(row);
    db[model] = {
      async findUnique({ where, select }) { return project(state[model].find((r) => matches(r, where)), select); },
      async findFirst(args = {}) { return (await this.findMany({ ...args, take: 1 }))[0] ?? null; },
      async findMany({ where, orderBy, take, select, cursor, skip = 0 } = {}) {
        let rows = state[model].filter((r) => matches(r, where));
        const order = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        rows.sort((a, b) => { for (const term of order) { const [key, direction] = Object.entries(term)[0]; if (a[key] < b[key]) return direction === "desc" ? 1 : -1; if (a[key] > b[key]) return direction === "desc" ? -1 : 1; } return 0; });
        if (cursor) { const index = rows.findIndex((r) => r.id === cursor.id); rows = index === -1 ? [] : rows.slice(index + skip); }
        return rows.slice(0, take).map((r) => project(r, select));
      },
      async count({ where }) { return state[model].filter((r) => matches(r, where)).length; },
      async create({ data }) {
        if (model === "manualIdentityAudit" && auditFails) throw Error("Audit storage failed");
        const row = { id: randomUUID(), createdAt: date, updatedAt: date,
          ...(model === "manualIdentityAttempt" ? { reviewerId: null, note: null, decidedAt: null, purgedAt: null } : {}),
          ...clone(data) };
        state[model].push(row); return clone(row);
      },
      async updateMany({ where, data }) { const rows = state[model].filter((r) => matches(r, where)); rows.forEach((r) => change(r, data)); return { count: rows.length }; },
      async update({ where, data }) { await this.updateMany({ where, data }); return this.findUnique({ where }); },
      async upsert({ where, create, update }) { if (await this.findUnique({ where })) return this.update({ where, data: update }); return this.create({ data: create }); },
    };
  }
  db.person = {
    async findUnique({ where }) { const row = state.account.find((a) => a.personId === where.id)?.person; return row ? clone(row) : null; },
    async updateMany({ where, data }) {
      const row = state.account.find((a) => a.personId === where.id)?.person;
      if (!row || !matches(row, where)) return { count: 0 };
      const previous = JSON.stringify([row.firstName, row.lastName, row.birthDate, row.gender]);
      const revision = row.identityRevision;
      change(row, data);
      row.identityRevision = revision + (JSON.stringify([row.firstName, row.lastName, row.birthDate, row.gender]) === previous ? 0 : 1);
      return { count: 1 };
    },
  };
  let chain = Promise.resolve();
  db.$transaction = (fn) => { const run = chain.then(async () => { const before = clone(state); try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; } }); chain = run.catch(() => {}); return run; };
  const storage = { check() {}, async get() { return Buffer.from("private WebP bytes"); }, async delete() {} };
  const policy = reviewPolicy({ MANUAL_IDENTITY_RETENTION_DAYS: "30" });
  const now = () => date;
  const service = createManualIdentityReviewService({ prisma: db, storage, policy, now });
  function images(account = ownerId) {
    return ["GOVERNMENT_ID", "SELFIE"].map((kind) => {
      const id = randomUUID(); state.manualIdentityEvidence.push({ id, accountId: account, kind, state: "READY", attemptId: null,
        storageKey: `test/${id}`, expiresAt: new Date(+date + 86400000), updatedAt: date, createdAt: date }); return id;
    });
  }
  function submission() {
    const [governmentId, selfie] = images();
    return { expectedVersion: state.manualIdentityRequest[0]?.version ?? 0, expectedProfileVersion: state.profile[0].version,
      idempotencyKey: randomUUID(), governmentId, selfie, consentVersion: MANUAL_REVIEW_CONSENT };
  }
  return { service, db, state, storage, policy, now, ownerId, reviewerId, otherId, sessionId, images, submission,
    advance(ms) { date = new Date(+date + ms); }, failAudit(value = true) { auditFails = value; },
    async assign() { const r = state.manualIdentityRequest[0]; return service.transition(reviewerId, sessionId, r.id, { expectedVersion: r.version }, true); },
    async decide(status = "APPROVED") { const r = state.manualIdentityRequest[0]; return service.transition(reviewerId, sessionId, r.id, { expectedVersion: r.version, attemptId: r.currentAttemptId, status, note: "Reviewed supporting ID and selfie against the saved claim." }); },
  };
}
