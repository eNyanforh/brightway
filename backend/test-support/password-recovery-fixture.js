import { randomUUID } from "node:crypto";
import { createPasswordResetService } from "../src/modules/auth/password-reset.service.js";
export function recoveryFixture() {
  const state = { account: [{ id: "account", email: "person@example.com", passwordHash: "old-hash", status: "ACTIVE", emailVerifiedAt: new Date() }], session: [{ id: "session-a", accountId: "account" }, { id: "session-b", accountId: "account" }, { id: "other-session", accountId: "other" }], passwordResetChallenge: [], passwordRecoveryAudit: [] };
  const messages = []; let date = new Date("2026-10-19T12:00:00Z"), n = 0, failSend = false, failAudit = false;
  const db = { $queryRaw: async () => [{ locked: 1 }] };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("gt" in value) return row[key] > value.gt;
      if ("lte" in value) return row[key] <= value.lte;
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  for (const model of Object.keys(state)) db[model] = {
    async findUnique({ where }) { return structuredClone(state[model].find((row) => matches(row, where)) ?? null); },
    async upsert({ where, create, update }) { const row = state[model].find((v) => matches(v, where)); if (row) Object.assign(row, update); else state[model].push(structuredClone(create)); },
    async updateMany({ where, data }) {
      const rows = state[model].filter((row) => matches(row, where));
      for (const row of rows) for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
      return { count: rows.length };
    },
    async deleteMany({ where }) { const previous = state[model].length; state[model] = state[model].filter((row) => !matches(row, where)); return { count: previous - state[model].length }; },
    async create({ data }) { if (model === "passwordRecoveryAudit" && failAudit) throw new Error("database failure"); const row = { id: randomUUID(), ...data }; state[model].push(row); return structuredClone(row); },
  };
  let chain = Promise.resolve();
  db.$transaction = (fn) => { const run = chain.then(async () => { const snapshot = structuredClone(state); try { return await fn(db); } catch (error) { Object.assign(state, snapshot); throw error; } }); chain = run.catch(() => {}); return run; };
  const sender = { check() {}, async send(message) { if (failSend) throw new Error("provider credentials must not leak"); messages.push(message); } };
  const options = { prisma: db, sender, secret: "test-secret-with-at-least-32-characters", now: () => date, code: () => String(++n).padStart(6, "0"), hash: async (password) => `hashed:${password}` };
  const recovery = createPasswordResetService(options);
  async function issue(email = "person@example.com") { const result = await recovery.request(email); await result.deliver(); return messages.at(-1)?.code; }
  return { state, db, messages, options, recovery, issue, setNow: (value) => { date = new Date(value); }, advance: (ms) => { date = new Date(+date + ms); }, failSend: () => { failSend = true; }, failAudit: () => { failAudit = true; } };
}
