import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProfileService } from "../src/modules/profile/profile.service.js";

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
    });
    const owner = await prisma.person.create({
      data: { firstName: randomUUID(), lastName: "HistoryTest" },
    });
    const other = await prisma.person.create({
      data: { firstName: randomUUID(), lastName: "HistoryOther" },
    });
    const service = createProfileService({ prisma });
    const row = {
      institution: "School",
      qualification: "Diploma",
      startMonth: "2020-09",
      endMonth: "2023-06",
      current: false,
      description: "",
    };
    try {
      const first = await Promise.allSettled(
        [1, 2].map(() =>
          service.saveHistory(owner.id, "education", {
            expectedVersion: 0,
            mode: "RECORDS",
            records: [row],
          }),
        ),
      );
      assert.equal(first.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        first.find((r) => r.status === "rejected").reason.status,
        409,
      );
      const saved = await service.read(owner.id),
        record = saved.education.records[0];
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
        await prisma.profile.count({ where: { personId: other.id } }),
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
          changes: { headline: "Concurrent text save" },
        }),
      ]);
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        race.find((r) => r.status === "rejected").reason.status,
        409,
      );
      const next = await service.read(owner.id);
      assert.equal(next.version, 2);
      if (next.education.mode === "NONE")
        assert.equal(next.education.records.length, 0);
      else assert.equal(next.education.records.length, 1);
    } finally {
      await prisma.profile.deleteMany({
        where: { personId: { in: [owner.id, other.id] } },
      });
      await prisma.person.deleteMany({
        where: { id: { in: [owner.id, other.id] } },
      });
      await prisma.$disconnect();
    }
  },
);