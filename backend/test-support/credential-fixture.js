import { randomUUID } from "node:crypto";
const copy = (v) => structuredClone(v);
export function credentialFixture() {
  const state = Object.fromEntries(["organization", "organizationRequest", "organizationMembership", "session", "mfaFactor", "account", "profile", "educationRecord", "experienceRecord", "credentialReview", "credentialAttempt", "credentialEvidence", "credentialUploadBudget", "credentialAuditEvent"].map((name) => [name, []]));
  let date = new Date("2026-10-18T12:00:00Z");
  const personId = randomUUID(), ownerId = randomUUID(), reviewerId = randomUUID(), otherId = randomUUID(), profileId = randomUUID(), recordId = randomUUID();
  state.account.push({ id: ownerId, personId, status: "ACTIVE", platformRole: "MEMBER", emailVerifiedAt: date }, { id: reviewerId, personId: randomUUID(), status: "ACTIVE", platformRole: "CREDENTIAL_REVIEWER", emailVerifiedAt: date }, { id: otherId, personId: randomUUID(), status: "ACTIVE", platformRole: "MEMBER", emailVerifiedAt: date });
  state.profile.push({ id: profileId, personId, version: 1, educationMode: "RECORDS", experienceMode: "NONE", skills: [], interests: [] });
  state.educationRecord.push({ id: recordId, profileId, revision: 1, status: "DRAFT", institution: "School", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" });
  const db = {};
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "AND") return value.every((v) => matches(row, v));
      if (key === "request") return matches(state.organizationRequest.find(r => r.id === row.requestId) ?? {}, value);
      if (key === "OR") return value.some((v) => matches(row, v));
      if (key === "profile") { const profile = state.profile.find((v) => v.id === row.profileId); return Boolean(profile && matches(profile, value)); }
      if (["kind_recordId", "personId_hour"].includes(key)) return matches(row, value);
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("has" in value) return row[key]?.includes(value.has);
        if ("contains" in value) return String(row[key]).toLowerCase().includes(value.contains.toLowerCase());
        if ("in" in value) return value.in.includes(row[key]);
        if ("lt" in value) return row[key] < value.lt;
        if ("lte" in value) return row[key] <= value.lte;
        if ("gt" in value) return row[key] > value.gt;
        if ("not" in value) return row[key] !== value.not;
      }
      if (value instanceof Date) return row[key]?.getTime() === value.getTime();
      return row[key] === value;
    });
  }
  function view(model, row, args = {}) {
    if (!row) return null;
    const result = copy(row);
    if (model === "profile") {
      result.educationRecords = copy(state.educationRecord.filter((v) => v.profileId === row.id));
      result.experienceRecords = copy(state.experienceRecord.filter((v) => v.profileId === row.id));
    }
    if (model === "credentialReview") {
      result.attempts = state.credentialAttempt.filter((v) => v.reviewId === row.id).map((v) => view("credentialAttempt", v));
      result.events = copy(state.credentialAuditEvent.filter((v) => v.reviewId === row.id));
      result.profile = copy(state.profile.find((v) => v.id === row.profileId));
      result.profile.person = { account: copy(state.account.find((v) => v.personId === result.profile.personId)) };
    }
    if (model === "credentialAttempt") {
      result.evidence = copy(state.credentialEvidence.filter((v) => v.attemptId === row.id));
      if (args.select?.review) result.review = copy(state.credentialReview.find((v) => v.id === row.reviewId));
    }
    return result;
  }
  for (const model of Object.keys(state)) db[model] = {
    async findUnique(args) { return view(model, state[model].find((v) => matches(v, args.where)), args); },
    async findFirst(args) { return (await this.findMany({ ...args, take: 1 }))[0] ?? null; },
    async findMany(args = {}) {
      const rows = state[model].filter((v) => matches(v, args.where));
      const order = Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [];
      rows.sort((a, b) => { for (const term of order) { const [key, direction] = Object.entries(term)[0]; if (a[key] < b[key]) return direction === "desc" ? 1 : -1; if (a[key] > b[key]) return direction === "desc" ? -1 : 1; } return 0; });
      const start = args.cursor ? rows.findIndex(v => v.id === args.cursor.id) + (args.skip || 0) : 0;
      return rows.slice(start, args.take ? start + args.take : undefined).map((v) => view(model, v, args));
    },
    async create({ data }) {
      const row = { id: randomUUID(), version: 1, status: "SUBMITTED", createdAt: date, count: 0, state: "UPLOADING", attemptId: null, reviewerId: null, note: null, issuerOrganizationId: null, issuerName: null, ...data };
      state[model].push(row); return view(model, row);
    },
    async upsert({ where, create, update }) { const row = state[model].find((v) => matches(v, where)); if (!row) return this.create({ data: create }); Object.assign(row, update); return copy(row); },
    async updateMany({ where, data }) {
      const rows = state[model].filter((v) => matches(v, where));
      for (const row of rows) for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
      return { count: rows.length };
    },
    async update(args) { await this.updateMany(args); return this.findUnique({ where: args.where }); },
    async deleteMany({ where }) { const old = state[model].length; state[model] = state[model].filter((v) => !matches(v, where)); return { count: old - state[model].length }; },
  };
  let chain = Promise.resolve();
  db.$transaction = (fn) => {
    const run = chain.then(async () => { const saved = copy(state); try { return await fn(db); } catch (error) { Object.assign(state, saved); throw error; } });
    chain = run.catch(() => {}); return run;
  };
  function authorizeReviewer(accountId = reviewerId) {
    let factor = state.mfaFactor.find((row) => row.accountId === accountId);
    if (!factor) { factor = { accountId, enabled: true, version: 1 }; state.mfaFactor.push(factor); }
    const sessionId = randomUUID();
    state.session.push({ id: sessionId, accountId, expiresAt: new Date(+date + 3600000), mfaVerifiedAt: date, mfaVersion: factor.version });
    return sessionId;
  }
  const reviewerSessionId = authorizeReviewer();
  const storage = { check() {}, async put() {}, async get() { return Buffer.from("private"); }, async delete() {} };
  return { db, state, storage, personId, ownerId, reviewerId, otherId, profileId, recordId, reviewerSessionId, authorizeReviewer, now: () => date, setNow: (next) => { date = new Date(next); } };
}

