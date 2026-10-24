import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSignupEmailService } from "../src/modules/auth/signup-email.service.js";
import { createRegistrationService } from "../src/modules/auth/registration.service.js";
import {
  createPhotoService,
  draftHash,
} from "../src/modules/photos/photo.service.js";

function reportRejections(label, results) {
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(`${label}, request ${index + 1}:`, result.reason);
    }
  }
}

test(
  "database email verification commits attempt limits and creates at most one verified account with atomic photo/proof claims",
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

    const marker = randomUUID();
    const email = `${marker}@example.com`;

    const verification = createSignupEmailService({
      prisma,
      sender: {
        check() {},
        async send() {},
      },
      secret: "test-only-secret-" + marker,
      code: () => "123456",
    });

    const photos = createPhotoService({
      prisma,
      storage: {
        check() {},
        async put() {},
      },
      process: async () => ({
        bytes: Buffer.from("fake-processed-photo"),
        width: 128,
        height: 128,
      }),
    });

    const register = createRegistrationService({
      prisma,
      photos,
      verification,
      hash: async () => "test-password-hash",
    });

    let draft;
    let badDraft;

    try {
      draft = await photos.begin();

      const asset = await photos.uploadDraft(
        draft.token,
        Buffer.from("test-photo"),
        "image/png",
      );

      const input = {
        gender: "MALE",
        birthDate: "2000-06-15",
        countryCode: "LR",
        email,
        firstName: marker,
        lastName: "EmailTest",
        username: `email_${marker.replaceAll("-", "").slice(0, 20)}`,
        password: "long-test-password",
        photoAssetId: asset.photoAssetId,
      };

      await assert.rejects(
        register(input, draft.token),
        { status: 403 },
      );

      assert.equal(
        await prisma.account.count({ where: { email } }),
        0,
      );

      await verification.request(draft.token, email);

      const results = await Promise.allSettled([
        verification.verify(draft.token, email, "123456"),
        verification.verify(draft.token, email, "123456"),
      ]);

      reportRejections("Signup verification race", results);

      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
        "Exactly one verification must succeed",
      );

      for (const result of results) {
        if (result.status === "rejected") {
          assert.equal(
            result.reason?.status,
            400,
            "Repeated verification must reject the code, not fail with a database error",
          );
        }
      }

      await assert.rejects(
        register(
          { ...input, email: `other_${email}` },
          draft.token,
        ),
        { status: 403 },
      );

      // A database failure after proof consumption must roll back
      // both the photo claim and verification proof consumption.
      const broken = createRegistrationService({
        prisma,
        photos,
        verification,
        hash: async () => "hash",
      });

      await assert.rejects(
        broken(
          { ...input, username: undefined },
          draft.token,
        ),
      );

      await verification.requireVerified(draft.token, email);

      const readyPhoto = await prisma.photoAsset.findUnique({
        where: { id: asset.photoAssetId },
      });

      assert.equal(readyPhoto.state, "READY");

      const attempts = await Promise.allSettled([
        register(input, draft.token),
        register(input, draft.token),
      ]);

      reportRejections("Signup registration race", attempts);

      assert.equal(
        attempts.filter((result) => result.status === "fulfilled").length,
        1,
        "Exactly one account creation must succeed",
      );

      for (const result of attempts) {
        if (result.status === "rejected") {
          assert.ok(
            [400, 403, 409].includes(result.reason?.status),
            "Duplicate registration must return an application rejection, not a database error",
          );
        }
      }

      const account = attempts.find(
        (result) => result.status === "fulfilled",
      ).value;

      assert(account.emailVerifiedAt instanceof Date);

      const person = await prisma.person.findUnique({
        where: { id: account.person.id },
      });

      assert.equal(person.gender, "MALE");
      assert.equal(
        person.birthDate.toISOString(),
        "2000-06-15T00:00:00.000Z",
      );

      const profile = await prisma.profile.findUnique({
        where: { personId: account.person.id },
      });

      assert.equal(profile.countryCode, "LR");
      assert.equal(profile.photoId, asset.photoAssetId);

      assert.equal(
        await prisma.account.count({ where: { email } }),
        1,
      );

      await assert.rejects(
        verification.requireVerified(draft.token, email),
        { status: 403 },
      );

      badDraft = await photos.begin();
      await verification.request(badDraft.token, `bad_${email}`);

      const guesses = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          verification.verify(
            badDraft.token,
            `bad_${email}`,
            "999999",
          ),
        ),
      );

      reportRejections("Signup wrong-code guess", guesses);

      for (const result of guesses) {
        assert.equal(
          result.status,
          "rejected",
          "Every incorrect code must be rejected",
        );

        assert.equal(
          result.reason?.status,
          400,
          "Incorrect codes must return validation errors, not database failures",
        );
      }

      const savedDraft = await prisma.signupDraft.findUnique({
        where: {
          tokenHash: draftHash(badDraft.token),
        },
      });

      assert.equal(
        savedDraft.emailCodeAttempts,
        5,
        "Concurrent wrong guesses must persist the five-attempt limit",
      );

      await assert.rejects(
        verification.verify(
          badDraft.token,
          `bad_${email}`,
          "123456",
        ),
        { status: 400 },
      );
    } finally {
      try {
        const owners = await prisma.person.findMany({
          where: { firstName: marker },
          select: { id: true },
        });

        const ids = owners.map((row) => row.id);
        const tokenHashes = [draft, badDraft]
          .filter(Boolean)
          .map((row) => draftHash(row.token));

        await prisma.profile.deleteMany({
          where: { personId: { in: ids } },
        });

        await prisma.account.deleteMany({
          where: { personId: { in: ids } },
        });

        await prisma.photoAsset.deleteMany({
          where: {
            draft: {
              tokenHash: { in: tokenHashes },
            },
          },
        });

        await prisma.person.deleteMany({
          where: { id: { in: ids } },
        });

        await prisma.signupDraft.deleteMany({
          where: { tokenHash: { in: tokenHashes } },
        });

        // Expiry cleanup handles this test's HMAC delivery counters.
      } finally {
        await prisma.$disconnect();
      }
    }
  },
);