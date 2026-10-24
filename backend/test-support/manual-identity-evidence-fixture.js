import { randomUUID } from "node:crypto";
import { createManualIdentityEvidenceService } from "../src/modules/manual-identity/manual-identity-evidence.service.js";
export function manualEvidenceFixture() {
  let date = new Date("2026-10-24T18:30:00Z");
  const ownerId = randomUUID(), otherId = randomUUID(), personId = randomUUID();
  const state = { account: [{ id: ownerId, personId, status: "ACTIVE" }, { id: otherId, personId: randomUUID(), status: "ACTIVE" }],
    profile: [{ id: randomUUID(), personId, version: 1, countryCode: "US", locality: "City", headline: "Developer",
      careerFieldMode: "EXPLORING", skills: ["JavaScript"], interests: ["Technology"], photo: { id: randomUUID() },
      person: { phoneNumber: "+231770000000", account: { email: "owner@example.invalid", emailVerifiedAt: date } },
      educationMode: "RECORDS", experienceMode: "RECORDS", educationRecords: [{ status: "VERIFIED" }], experienceRecords: [{ status: "VERIFIED" }] }],
    manualIdentityEvidence: [], manualIdentityUploadBudget: [] };
  const copy = (v) => structuredClone(v);
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((part) => matches(row, part));
      if (value instanceof Date) return +row[key] === +value;
      if (value && typeof value === "object") {
        if ("in" in value) return value.in.includes(row[key]);
        if ("gt" in value) return row[key] > value.gt;
        if ("lt" in value) return row[key] < value.lt;
      }
      return row[key] === value;
    });
  }
  const db = {};
  for (const model of Object.keys(state)) {
    const project = (row, select) => !row ? null : select ? Object.fromEntries(Object.keys(select).map((key) => [key, copy(row[key])])) : copy(row);
    db[model] = {
      async findUnique({ where, select }) { return project(state[model].find((r) => matches(r, where)), model === "profile" ? null : select); },
      async findFirst(args) { return (await this.findMany({ ...args, take: 1 }))[0] ?? null; },
      async findMany({ where, select, take } = {}) { return state[model].filter((r) => matches(r, where)).slice(0, take).map((r) => project(r, select)); },
      async count({ where }) { return state[model].filter((r) => matches(r, where)).length; },
      async create({ data }) { const row = { id: randomUUID(), createdAt: date, updatedAt: date, ...copy(data) }; state[model].push(row); return copy(row); },
      async updateMany({ where, data }) { const rows = state[model].filter((r) => matches(r, where)); for (const row of rows) Object.assign(row, copy(data), { updatedAt: date }); return { count: rows.length }; },
      async upsert({ where, create, update }) { if (!await this.findUnique({ where })) return this.create({ data: create }); await this.updateMany({ where, data: update }); return this.findUnique({ where }); },
    };
  }
  let chain = Promise.resolve();
  db.$transaction = (fn) => { const next = chain.then(async () => { const before = copy(state); try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; } }); chain = next.catch(() => {}); return next; };
  const objects = new Map();
  const storage = { check() {}, async put(key, bytes) { objects.set(key, Buffer.from(bytes)); }, async get(key) { return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const now = () => date;
  const image = async () => ({ bytes: Buffer.from("sanitized webp"), width: 640, height: 480 });
  const service = createManualIdentityEvidenceService({ prisma: db, storage, now, processImage: image });
  return { ownerId, otherId, personId, state, db, storage, objects, now, image, service, advance(ms) { date = new Date(+date + ms); } };
}
