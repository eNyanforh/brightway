import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createIdentityService } from "../src/modules/identity/identity.service.js";

test("database Persona sandbox creation races, unique binding, replay and stale identity updates remain atomic", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 15000, timeout: 15000 } });
  const marker = randomUUID().replaceAll("-", ""), provider = new Map(); let date = new Date(), account;
  const service = createIdentityService({ prisma: db, now: () => date, persona: { templateId: "itmpl_database", check() {},
    async create(attempt) {
      if (!provider.has(attempt.idempotencyKey)) provider.set(attempt.idempotencyKey, { inquiryId: `inq_${randomUUID().replaceAll("-", "")}`, status: "created", updatedAt: date });
      return provider.get(attempt.idempotencyKey);
    },
    async retrieve(attempt) { return provider.get(attempt.idempotencyKey); },
  } });
  try {
    account = await db.account.create({ data: { username: `identity_${marker}`, email: `identity_${marker}@example.invalid`, emailVerifiedAt: date,
      passwordHash: "not-a-usable-password-hash", person: { create: { firstName: "Sandbox", lastName: marker, birthDate: new Date("2000-01-01") } } } });
    const results = await Promise.all([service.start(account.id), service.start(account.id)]);
    assert.equal(results[0].inquiryId, results[1].inquiryId); assert.equal(provider.size, 1);
    assert.equal(await db.identityInquiry.count({ where: { accountId: account.id } }), 1);
    const attempt = await db.identityInquiry.findFirst({ where: { accountId: account.id } });
    date = new Date(+date + 1000);
    const event = { data: { type: "event", id: `evt_${marker}`, attributes: { name: "inquiry.approved", payload: { data: { id: attempt.inquiryId, type: "inquiry",
      attributes: { "reference-id": attempt.referenceId, "updated-at": date.toISOString(), status: "approved" },
      relationships: { "inquiry-template": { data: { id: attempt.templateId } } },
    } } } } };
    await Promise.all([service.webhook(event), service.webhook(event)]);
    assert.equal(await db.identityWebhookReceipt.count({ where: { id: event.data.id } }), 1);
    assert.equal((await service.read(account.id)).sandboxApproved, true); assert.equal((await service.read(account.id)).identityVerified, false);
    await db.person.update({ where: { id: account.personId }, data: { firstName: "Changed" } });
    assert.equal((await service.read(account.id)).status, "stale");
    const replacement = await service.start(account.id); assert.notEqual(replacement.inquiryId, attempt.inquiryId);
    event.data.id = `evt_${marker}delayed`; await service.webhook(event);
    assert.equal((await service.read(account.id)).sandboxApproved, false);
    assert.equal((await db.identityWebhookReceipt.findUnique({ where: { id: event.data.id } })).outcome, "STALE");
  } finally {
    try {
      if (account) {
        const attempts = await db.identityInquiry.findMany({ where: { accountId: account.id } });
        await db.identityWebhookReceipt.deleteMany({ where: { inquiryId: { in: attempts.map((a) => a.inquiryId).filter(Boolean) } } });
        await db.account.delete({ where: { id: account.id } }); await db.person.delete({ where: { id: account.personId } });
      }
    } finally { await db.$disconnect(); }
  }
});
