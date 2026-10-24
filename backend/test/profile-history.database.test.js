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
  "database history races, foreign records and declaration changes remain atomic",
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

    const people = [];

    try {
      const owner = await prisma.person.create({
        data: {
          firstName: randomUUID(),
          lastName: "HistoryTest",
        },
      });
      people.push(owner.id);

      const other = await prisma.person.create({
        data: {
          firstName: randomUUID(),
          lastName: "HistoryOther",
        },
      });
      people.push(other.id);

      const service = createProfileService({ prisma });

      const row = {
        institution: "School",
        qualification: "Diploma",
        startMonth: "2020-09",
        endMonth: "2023-06",
        current: false,
        description: "",
      };

      const first = await Promise.allSettled(
        [1, 2].map(() =>
          service.saveHistory(owner.id, "education", {
            expectedVersion: 0,
            mode: "RECORDS",
            records: [row],
          }),
        ),
      );

      reportRejections("History first-save race", first);

      assert.equal(
        first.filter((result) => result.status === "fulfilled").length,
        1,
        "Exactly one first history save must succeed",
      );

      assert.equal(
        first.find((result) => result.status === "rejected")?.reason?.status,
        409,
        "The competing history save must return a 409 conflict",
      );

      const saved = await service.read(owner.id);
      const record = saved.education.records[0];
      const { status, ...claim } = record;
      void status;

      await assert.rejects(
        service.saveHistory(other.id, "education", {
          expectedVersion: 0,
          mode: "RECORDS",
          records: [claim],
        }),
        { status: 404 },
      );

      assert.equal(
        await prisma.profile.count({
          where: { personId: other.id },
        }),
        0,
      );

      const race = await Promise.allSettled([
        service.saveHistory(owner.id, "education", {
          expectedVersion: 1,
          mode: "NONE",
          records: [],
        }),
        service.patch(owner.id, {
          expectedVersion: 1,
          changes: {
            headline: "Concurrent text save",
          },
        }),
      ]);

      reportRejections("History declaration/text race", race);

      assert.equal(
        race.filter((result) => result.status === "fulfilled").length,
        1,
        "Exactly one competing update must succeed",
      );

      assert.equal(
        race.find((result) => result.status === "rejected")?.reason?.status,
        409,
        "The competing update must return a 409 conflict",
      );

      const next = await service.read(owner.id);
      assert.equal(next.version, 2);

      if (next.education.mode === "NONE") {
        assert.equal(next.education.records.length, 0);
      } else {
        assert.equal(next.education.records.length, 1);
      }
    } finally {
      try {
        await prisma.profile.deleteMany({
          where: { personId: { in: people } },
        });

        await prisma.person.deleteMany({
          where: { id: { in: people } },
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  },
);