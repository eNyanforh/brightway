import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProfileService } from "../src/modules/profile/profile.service.js";

function reportRejections(label, results) {
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(`${label}, request ${index + 1}:`, result.reason);
    }
  }
}

test(
  "database profile first-save and stale-version races preserve one winning draft",
  {
    skip:
      !process.env.TEST_DATABASE_URL &&
      "Set TEST_DATABASE_URL to a separate migrated test database",
  },
  async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.TEST_DATABASE_URL,
      }),
      transactionOptions: {
        maxWait: 10000,
        timeout: 15000,
      },
    });

    let person;

    try {
      person = await prisma.person.create({
        data: {
          firstName: randomUUID(),
          lastName: "ProfileTest",
        },
      });

      const service = createProfileService({ prisma });

      const first = await Promise.allSettled(
        ["First", "Second"].map((headline) =>
          service.patch(person.id, {
            expectedVersion: 0,
            changes: { headline },
          }),
        ),
      );

      reportRejections("Profile first-save race", first);

      assert.equal(
        first.filter((result) => result.status === "fulfilled").length,
        1,
        "Exactly one first save must succeed",
      );

      assert.equal(
        first.find((result) => result.status === "rejected")?.reason?.status,
        409,
        "The competing first save must return a 409 conflict",
      );

      const second = await Promise.allSettled(
        ["Winner A", "Winner B"].map((headline) =>
          service.patch(person.id, {
            expectedVersion: 1,
            changes: { headline },
          }),
        ),
      );

      reportRejections("Profile stale-version race", second);

      assert.equal(
        second.filter((result) => result.status === "fulfilled").length,
        1,
        "Exactly one update must succeed",
      );

      assert.equal(
        second.find((result) => result.status === "rejected")?.reason?.status,
        409,
        "The competing update must return a 409 conflict",
      );

      const saved = await service.read(person.id);
      assert.equal(saved.version, 2);

      assert.equal(
        await prisma.profile.count({
          where: { personId: person.id },
        }),
        1,
      );

      const missing = await service.read(randomUUID());
      assert.equal(missing.id, null);
    } finally {
      try {
        if (person) {
          await prisma.profile.deleteMany({
            where: { personId: person.id },
          });

          await prisma.person.delete({
            where: { id: person.id },
          });
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  },
);