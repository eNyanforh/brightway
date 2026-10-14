import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProfileService } from "../src/modules/profile/profile.service.js";

test("database profile first-save and stale-version races preserve one winning draft", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const person = await prisma.person.create({ data: { firstName: randomUUID(), lastName: "ProfileTest" } });
  const service = createProfileService({ prisma });
  try {
    const first = await Promise.allSettled(["First", "Second"].map((headline) => service.patch(person.id, { expectedVersion: 0, changes: { headline } })));
    assert.equal(first.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(first.find((result) => result.status === "rejected").reason.status, 409);
    const second = await Promise.allSettled(["Winner A", "Winner B"].map((headline) => service.patch(person.id, { expectedVersion: 1, changes: { headline } })));
    assert.equal(second.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(second.find((result) => result.status === "rejected").reason.status, 409);
    assert.equal((await service.read(person.id)).version, 2);
    assert.equal(await prisma.profile.count({ where: { personId: person.id } }), 1);
    assert.equal((await service.read(randomUUID())).id, null);
  } finally {
    await prisma.profile.deleteMany({ where: { personId: person.id } });
    await prisma.person.delete({ where: { id: person.id } });
    await prisma.$disconnect();
  }
});