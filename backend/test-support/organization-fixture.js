import { randomUUID } from "node:crypto";
import { createOrganizationService } from "../src/modules/organizations/organization.service.js";
const clone = v => structuredClone(v);
export function organizationFixture({ ready = true } = {}) {
  let date = new Date("2026-10-27T12:00:00Z"), auditFails = false, auditHook;
  const state = Object.fromEntries(["person", "profile", "photoAsset", "account", "session", "mfaFactor", "organizationOperator", "organizationRequest", "organizationFinding", "organizationFindingArchive", "organizationRequestAudit", "organizationRequestRevision", "organization", "organizationOperatingLocation", "organizationMembership", "organizationInvitation", "organizationStaffAudit", "organizationPhoto"].map(k => [k, []]));
  const actors = {};
  for (const label of ["owner", "agent", "approver", "other"]) {
    const id = randomUUID(), sessionId = randomUUID(); actors[label] = { id, sessionId, username: `${label}_fixture` };
    state.account.push({ id, username: `${label}_fixture`, emailVerifiedAt: date, status: "ACTIVE", personId: randomUUID(), identityRevision: 0, platformRole: "MEMBER" });
    state.person.push({ id: state.account.at(-1).personId, firstName: "Synthetic", middleName: null, lastName: label });
    state.session.push({ id: sessionId, accountId: id, expiresAt: new Date(+date + 7 * 86400000), mfaVerifiedAt: ["agent", "approver"].includes(label) ? date : null, mfaVersion: ["agent", "approver"].includes(label) ? 1 : 0 });
    if (["agent", "approver"].includes(label)) {
      state.mfaFactor.push({ accountId: id, enabled: true, version: 1 });
      state.organizationOperator.push({ accountId: id, agentEnabled: label === "agent", approverEnabled: label === "approver" });
    }
  }
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      if (key === "account") return matches(state.account.find(r => r.id === row.accountId) ?? {}, value);
      if (key === "recipient") return matches(state.account.find(r => r.id === row.recipientId) ?? {}, value);
      if (key === "organization") return matches(state.organization.find(r => r.id === row.organizationId) ?? {}, value);
      if (key === "request") return matches(state.organizationRequest.find(r => r.id === row.requestId) ?? {}, value);
      if (key === "AND") return value.every(w => matches(row, w));
      if (key === "OR") return value.some(w => matches(row, w));
      if (key === "applicantId_idempotencyKey") return matches(row, value);
      if (value instanceof Date) return +row[key] === +value;
      if (value && typeof value === "object") {
        if ("contains" in value) return String(row[key] ?? "").toLowerCase().includes(value.contains.toLowerCase().replace(/\\([\\%_])/g, "$1"));
        if ("in" in value) return value.in.includes(row[key]); if ("not" in value) return row[key] !== value.not;
        if ("gt" in value) return row[key] > value.gt; if ("gte" in value) return row[key] >= value.gte;
      }
      return row[key] === value;
    });
  }
  function project(row, select) {
    if (!row) return null;
    if (row.personId && state.account.some(r => r.id === row.id)) row = { ...row, person: state.person.find(p => p.id === row.personId) };
    if (state.person.some(p => p.id === row.id)) row = { ...row, profile: state.profile.find(p => p.personId === row.id) };
    if (row.requestId && state.organization.some(r => r.id === row.id)) row = { ...row, locations: state.organizationOperatingLocation.filter(r => r.organizationId === row.id) };
    if (row.organizationId) row = { ...row, organization: state.organization.find(r => r.id === row.organizationId) };
    if (!select) return clone(row);
    return Object.fromEntries(Object.entries(select).map(([key, value]) => [key, typeof value === "object" && value.select ? Array.isArray(row[key]) ? row[key].map(x => project(x, value.select)) : project(row[key], value.select) : clone(row[key])]));
  }
  const db = {};
  for (const [model, rows] of Object.entries(state)) {
    void rows;
    db[model] = {
      async findUnique({ where, select }) { return project(state[model].find(r => matches(r, where)), select); },
      async findFirst(args = {}) { return (await this.findMany({ ...args, take: 1 }))[0] ?? null; },
      async findMany({ where, select, orderBy, cursor, skip = 0, take } = {}) {
        let rows = state[model].filter(r => matches(r, where));
        const order = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        rows.sort((a, b) => { for (const entry of order) { const [key, direction] = Object.entries(entry)[0]; if (a[key] < b[key]) return direction === "desc" ? 1 : -1; if (a[key] > b[key]) return direction === "desc" ? -1 : 1; } return 0; });
        if (cursor) { const index = rows.findIndex(r => r.id === cursor.id); rows = index < 0 ? [] : rows.slice(index + skip); }
        return rows.slice(0, take).map(r => project(r, select));
      },
      async count({ where }) { return state[model].filter(r => matches(r, where)).length; },
      async groupBy({ by, where }) {
        const groups = new Map();
        for (const row of state[model].filter(r => matches(r, where))) { const key = JSON.stringify(by.map(k => row[k])); if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(by.map(k => [k, row[k]])), _count: 0 }); groups.get(key)._count++; }
        return [...groups.values()].map(clone);
      },
      async create({ data }) {
        if (["organizationRequestAudit", "organizationStaffAudit"].includes(model)) { if (auditFails) throw Error("Audit failed"); if (auditHook) await auditHook(data); }
        const value = { id: randomUUID(), createdAt: date, updatedAt: date,
          ...(model === "organizationRequest" ? { version: 1, status: "SUBMITTED", assignedAgentId: null, decisionReason: null, decidedById: null, decidedAt: null } : {}),
          ...(model === "organization" ? { status: "ACTIVE", staffVersion: 1, username: null, profileVersion: 0, profileSetupStep: 1, phoneNumber: null, contactEmail: null, website: null, profileReadyAt: null, profilePhotoId: null } : {}),
          ...(model === "organizationPhoto" ? { state: "UPLOADING" } : {}),
          ...(model === "organizationMembership" ? { role: "STAFF", enabled: true, permissions: [], version: 1 } : {}),
          ...(model === "organizationInvitation" ? { state: "PENDING", version: 1, respondedAt: null } : {}), ...clone(data) };
        if (model === "organization") {
          const { locations, memberships } = value; delete value.locations; delete value.memberships;
          state.organizationOperatingLocation.push({ id: randomUUID(), organizationId: value.id, primary: true, ...locations.create });
          state.organizationMembership.push({ id: randomUUID(), organizationId: value.id, enabled: true, permissions: [], version: 1, createdAt: date, ...memberships.create });
        }
        state[model].push(value); return clone(value);
      },
      async deleteMany({ where }) {
        const before = state[model].length; state[model] = state[model].filter(row => !matches(row, where)); return { count: before - state[model].length };
      },
      async updateMany({ where, data }) {
        let count = 0; for (const row of state[model]) if (matches(row, where)) { for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && "increment" in v ? row[k] + v.increment : clone(v); row.updatedAt = date; count++; } return { count };
      },
    };
  }
  let chain = Promise.resolve();
  db.$transaction = work => { const result = chain.then(async () => { const before = clone(state); try { return await work(db); } catch (e) { for (const key of Object.keys(state)) state[key] = before[key]; throw e; } }); chain = result.catch(() => {}); return result; };
  const service = createOrganizationService({ prisma: db, now: () => date });
  const input = () => ({ idempotencyKey: randomUUID(), name: " Global Test School ", type: "SCHOOL", representativeRole: "Principal", countryCode: "gh", region: "", city: "Accra", address: "Synthetic operating location" });
  const finding = () => ({ expectedVersion: 2, existenceConfirmed: true, locationConfirmed: true, authorityConfirmed: true, typeConfirmed: true, operationalConfirmed: true, recommendation: "APPROVE", notes: "Synthetic verification findings only.", setupAssistance: "Setup explained to the representative." });
  return { db, state, actors, service, input, finding, now: () => date, advance(ms) { date = new Date(+date + ms); }, failAudit(value = true) { auditFails = value; }, onAudit(fn) { auditHook = fn; },
    async submit(body = input()) { return service.submit(actors.owner.id, actors.owner.sessionId, body); },
    async assign(r) { return service.assign(actors.approver.id, actors.approver.sessionId, r.id, { expectedVersion: r.version, agentUsername: actors.agent.username }); },
    async report(r) { return service.report(actors.agent.id, actors.agent.sessionId, r.id, { ...finding(), expectedVersion: r.version }); },
    async decide(r, decision = "APPROVE") { const result = await service.decide(actors.approver.id, actors.approver.sessionId, r.id, { expectedVersion: r.version, decision, reason: "Synthetic organization decision feedback." });
      if (ready && result.organizationId) {
        const org = state.organization.find(o => o.id === result.organizationId), photoId = randomUUID();
        Object.assign(org, { username: `org_${org.id.replaceAll("-", "").slice(0, 20)}`, profilePhotoId: photoId, profileReadyAt: date, profileVersion: 2, profileSetupStep: 5 });
        state.organizationPhoto.push({ id: photoId, organizationId: org.id, storageKey: `synthetic/${photoId}`, state: "CLAIMED", expiresAt: date, createdAt: date, updatedAt: date });
      }
      return result; },
  };
}
