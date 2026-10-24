import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProfileService } from "../src/modules/profile/profile.service.js";
import { profilePatchSchema } from "../src/modules/profile/profile.schema.js";

test(
  "database contacts inherit Person phone, default private, and serialize competing phone saves",
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

    const username = `ct_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    let account;

    try {
      account = await prisma.account.create({
        data: {
          username,
          email: `${username}@example.com`,
          passwordHash: "test-only-not-a-login-hash",
          person: {
            create: {
              firstName: "Contact",
              lastName: "Test",
              phoneNumber: "+231770000000",
            },
          },
        },
        select: {
          id: true,
          personId: true,
        },
      });

      const service = createProfileService({ prisma });

      const virtual = await service.read(account.personId);

      assert.equal(virtual.contact.phoneNumber, "+231770000000");
      assert.equal(virtual.contact.visibility.phone, "ONLY_ME");
      assert.deepEqual(await service.visibleContact(username), {});

      const first = await service.patch(
        account.personId,
        profilePatchSchema.parse({
          expectedVersion: 0,
          changes: {
            contact: {
              phoneNumber: "+231 77 111 1111",
              whatsappNumber: "+231 88 222 2222",
              visibility: {
                email: "PUBLIC",
                phone: "CONNECTIONS",
              },
            },
          },
        }),
      );

      assert.equal(first.version, 1);
      assert.equal(first.contact.whatsappNumber, "+231882222222");

      assert.deepEqual(
        await service.visibleContact(username, "another-person"),
        { email: `${username}@example.com` },
      );

      assert.equal(
        (await service.visibleContact(username, account.personId)).phoneNumber,
        "+231771111111",
      );

      const results = await Promise.allSettled(
        ["+231771111112", "+231771111113"].map((phoneNumber) =>
          service.patch(account.personId, {
            expectedVersion: 1,
            changes: {
              contact: { phoneNumber },
            },
          }),
        ),
      );

      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          console.error(
            `Contact race, request ${index + 1}:`,
            result.reason,
          );
        }
      }

      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );

      assert.equal(
        results.find((result) => result.status === "rejected")?.reason?.status,
        409,
        "The competing contact save must return a 409 conflict",
      );

      const current = await service.read(account.personId);
      assert.equal(current.version, 2);

      const person = await prisma.person.findUnique({
        where: { id: account.personId },
      });

      assert.equal(person.phoneNumber, current.contact.phoneNumber);

      const none = await service.patch(account.personId, {
        expectedVersion: 2,
        changes: {
          contact: {
            phoneNumber: null,
            whatsappNumber: null,
          },
        },
      });

      assert.equal(none.contact.phoneNumber, null);
      assert.equal(none.contact.whatsappNumber, null);

      assert(
        (await service.completion(account.personId)).missing.some(
          (item) => item.code === "PHONE_REQUIRED",
        ),
      );
    } finally {
      try {
        if (account) {
          await prisma.profile.deleteMany({
            where: { personId: account.personId },
          });

          await prisma.account.delete({
            where: { id: account.id },
          });

          await prisma.person.delete({
            where: { id: account.personId },
          });
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  },
);