import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRegistrationService } from "../src/modules/auth/registration.service.js";
import { createSessionService, tokenHash } from "../src/modules/auth/session.service.js";

test("database login persists, rotates, and revokes sessions", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const marker = randomUUID();
  const input = { firstName: marker, lastName: "SessionTest", username: `test_${marker.replaceAll("-", "").slice(0, 20)}`, email: `${marker}@example.com`, password: "A long test-only passphrase!" };
  const register = createRegistrationService({ prisma });
  const sessions = createSessionService({ prisma });
  try {
    const account = await register(input);
    const first = await sessions.login({ identifier: input.username, password: input.password });
    const stored = await prisma.session.findUnique({ where: { tokenHash: tokenHash(first.token) } });
    assert.equal(stored.accountId, account.id);
    assert.notEqual(stored.tokenHash, first.token);
    assert.equal((await sessions.authenticate(first.token)).account.id, account.id);
    const second = await sessions.login({ identifier: input.email, password: input.password }, first.token);
    await assert.rejects(sessions.authenticate(first.token), { status: 401 });
    assert.equal(await prisma.session.count({ where: { accountId: account.id } }), 1);
    await prisma.account.update({ where: { id: account.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(sessions.authenticate(second.token), { status: 401 });
    await sessions.logout(second.token);
    assert.equal(await prisma.session.count({ where: { accountId: account.id } }), 0);
  } finally {
    try {
      await prisma.account.deleteMany({ where: { person: { firstName: marker } } });
      await prisma.person.deleteMany({ where: { firstName: marker } });
    } finally { await prisma.$disconnect(); }
  }
});
