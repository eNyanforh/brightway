import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createAccountEmailService } from "../src/modules/auth/account-email.service.js";
import { createProfileService } from "../src/modules/profile/profile.service.js";

test("database existing-account email verification serializes requests and guesses, preserves profile revisions, and invalidates changed recipients", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 10000 }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID().replaceAll("-", "").slice(0, 16);
  const email = `existing_${marker}@example.com`;
  const secret = "test-only-existing-account-secret-" + marker;
  let time = new Date("2026-10-17T17:00:00Z");
  const deliveries = [];
  const service = createAccountEmailService({ prisma, secret, sender: { check() {}, async send(data) { deliveries.push(data); } }, now: () => time, code: () => String(123450 + deliveries.length) });
  const account = await prisma.account.create({ data: { username: `existing_${marker}`, email, passwordHash: "test-only-not-a-login-hash",
    person: { create: { firstName: "Existing", lastName: "Account", phoneNumber: "+231770000000", profile: { create: { version: 3, headline: "Saved headline" } } } } }, select: { id: true, personId: true } });
  const profiles = createProfileService({ prisma });
  try {
    assert((await profiles.completion(account.personId)).missing.some((item) => item.code === "EMAIL_VERIFICATION_REQUIRED"));
    const requests = await Promise.allSettled([service.request(account.personId), service.request(account.personId)]);
    assert.equal(requests.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(deliveries.length, 1);
    await Promise.allSettled(Array.from({ length: 8 }, () => service.verify(account.personId, "000000")));
    assert.equal((await prisma.accountEmailChallenge.findUnique({ where: { accountId: account.id } })).attempts, 5);
    await assert.rejects(service.verify(account.personId, "123450"), { status: 400 });
    time = new Date(time.getTime() + 60000); await service.request(account.personId);
    const verified = await Promise.allSettled([service.verify(account.personId, "123451"), service.verify(account.personId, "123451")]);
    assert.equal(verified.filter((item) => item.status === "fulfilled").length, 1);
    const profile = await profiles.read(account.personId);
    assert.equal(profile.version, 3); assert.equal(profile.headline, "Saved headline");
    assert(profile.contact.emailVerifiedAt instanceof Date);
    assert(!profile.completion.missing.some((item) => item.code === "EMAIL_VERIFICATION_REQUIRED"));
    assert.equal(profile.completion.eligibleToRequestVerification, false);
    await prisma.account.update({ where: { id: account.id }, data: { emailVerifiedAt: null } });
    time = new Date(time.getTime() + 60000); await service.request(account.personId);
    await prisma.account.update({ where: { id: account.id }, data: { email: `changed_${email}` } });
    await assert.rejects(service.verify(account.personId, "123452"), { status: 400 });
    assert.equal((await prisma.account.findUnique({ where: { id: account.id } })).emailVerifiedAt, null);
  } finally {
    try {
      await prisma.profile.deleteMany({ where: { personId: account.personId } });
      await prisma.account.delete({ where: { id: account.id } });
      await prisma.person.delete({ where: { id: account.personId } });
      const recipient = createHmac("sha256", secret).update(email).digest("hex");
      await prisma.signupEmailDeliveryLimit.deleteMany({ where: { id: { startsWith: recipient + ":" } } });
    } finally { await prisma.$disconnect(); }
  }
});