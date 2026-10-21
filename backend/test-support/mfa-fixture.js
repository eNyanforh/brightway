import { randomUUID } from "node:crypto";
import { createMfaService } from "../src/modules/auth/mfa.service.js";
import { createSessionService } from "../src/modules/auth/session.service.js";
import { fingerprint, totp } from "../src/modules/auth/mfa.crypto.js";
export function mfaFixture() {
  let date = new Date("2026-10-20T04:00:00Z"), auditFails = false;
  const state = {
    account: [{ id: "account", username: "tester", email: "tester@example.com", passwordHash: "old-hash", status: "ACTIVE", platformRole: "CREDENTIAL_REVIEWER", emailVerifiedAt: date, person: { id: "person", firstName: "Test", lastName: "User" } }],
    session: [{ id: "current", accountId: "account", tokenHash: fingerprint("a".repeat(64)), expiresAt: new Date(+date + 3600000), mfaVerifiedAt: null, mfaVersion: 0 }, { id: "other", accountId: "account", tokenHash: fingerprint("b".repeat(64)), expiresAt: new Date(+date + 3600000), mfaVerifiedAt: null, mfaVersion: 0 }],
    mfaFactor: [], mfaLoginChallenge: [], mfaAudit: [],
  };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("gt" in value) return row[key] > value.gt;
      if ("lte" in value) return row[key] <= value.lte;
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  function project(row, select) {
    if (!row) return null;
    if (!select) return structuredClone(row);
    return Object.fromEntries(Object.entries(select).map(([key, rule]) => [key, rule === true ? structuredClone(row[key]) : project(row[key], rule.select)]));
  }
  const db = {};
  for (const model of Object.keys(state)) db[model] = {
    async findUnique({ where, select }) { return project(state[model].find((row) => matches(row, where)), select); },
    async findFirst({ where }) { return this.findUnique({ where }); },
    async create({ data }) {
      if (model === "mfaAudit" && auditFails) throw new Error("audit storage failed");
      const row = { id: randomUUID(), attempts: 0, consumedAt: null, mfaVersion: 0, mfaVerifiedAt: null, ...data }; state[model].push(row); return structuredClone(row);
    },
    async upsert({ where, create, update }) { const row = state[model].find((v) => matches(v, where)); if (row) Object.assign(row, update); else state[model].push(structuredClone(create)); },
    async updateMany({ where, data }) {
      const rows = state[model].filter((row) => matches(row, where));
      for (const row of rows) for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
      return { count: rows.length };
    },
    async deleteMany({ where }) { const before = state[model].length; state[model] = state[model].filter((row) => !matches(row, where)); return { count: before - state[model].length }; },
  };
  let chain = Promise.resolve();
  db.$transaction = (fn) => { const run = chain.then(async () => { const saved = structuredClone(state); try { return await fn(db); } catch (e) { Object.assign(state, saved); throw e; } }); chain = run.catch(() => {}); return run; };
  db.$queryRaw = async (strings, hash) => {
    const session = state.session.find((row) => row.tokenHash === hash); if (!session) return [];
    const account = state.account.find((row) => row.id === session.accountId), factor = state.mfaFactor.find((row) => row.accountId === session.accountId);
    return [{ sessionId: session.id, expiresAt: session.expiresAt, sessionMfaVersion: session.mfaVersion, mfaVerifiedAt: session.mfaVerifiedAt, mfaEnabled: factor?.enabled, factorVersion: factor?.version, accountId: account.id, username: account.username, email: account.email, status: account.status, platformRole: account.platformRole, personId: account.person.id, firstName: account.person.firstName, lastName: account.person.lastName }];
  };
  const verify = async (password, hash) => password === "correct password" && hash === "old-hash";
  const options = { prisma: db, key: "11".repeat(32), now: () => date, verify };
  const mfa = createMfaService(options), sessions = createSessionService({ prisma: db, mfa, now: () => date, verify });
  const currentCode = (secret) => totp(secret, BigInt(Math.floor(+date / 30000)));
  async function enroll() { const setup = await mfa.begin("account", "correct password"); const result = await mfa.enable("account", "current", currentCode(setup.secret)); return { ...setup, ...result }; }
  return { db, state, options, mfa, sessions, enroll, currentCode, now: () => date, advance: (ms) => { date = new Date(+date + ms); }, failAudit: () => { auditFails = true; } };
}
