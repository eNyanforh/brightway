import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRegistrationService } from "../src/modules/auth/registration.service.js";

test("database registration rolls back the nested Person on duplicate Account", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const marker = randomUUID();
  const input = { firstName: marker, lastName: "IntegrationTest", username: `test_${marker.replaceAll("-", "").slice(0, 20)}`, email: `${marker}@example.com`, password: "A test-only long passphrase" };
  const register = createRegistrationService({ prisma });
  try {
    const account = await register(input);
    assert.equal(account.passwordHash, undefined);
    assert.equal(await prisma.person.count({ where: { firstName: marker } }), 1);
    await assert.rejects(register(input), { status: 409 });
    assert.equal(await prisma.person.count({ where: { firstName: marker } }), 1);
    await assert.rejects(register({ ...input, username: `${input.username}_2` }), { status: 409 });
    await assert.rejects(register({ ...input, email: `second_${input.email}` }), { status: 409 });
    assert.equal(await prisma.person.count({ where: { firstName: marker } }), 1);
  } finally {
    try {
      await prisma.account.deleteMany({ where: { person: { firstName: marker } } });
      await prisma.person.deleteMany({ where: { firstName: marker } });
    } finally { await prisma.$disconnect(); }
  }
});
