import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createSignupEmailSender } from "./signup-email.sender.js";

const MINUTE = 60000;
const error = (status, message) => Object.assign(new Error(message), { status });
const invalid = () => error(400, "That code is invalid or expired. Request a new code if needed.");

export function createAccountEmailService({ prisma, sender = createSignupEmailSender(),
  secret = process.env.EMAIL_VERIFICATION_SECRET, now = () => new Date(),
  code = () => String(randomInt(0, 1000000)).padStart(6, "0"),
}) {
  function configured() {
    if (typeof secret !== "string" || secret.length < 32)
      throw error(503, "Verification email is temporarily unavailable. Please try again later.");
  }
  const digest = (value) => createHmac("sha256", secret).update(value).digest("hex");
  const hash = (account, nonce, value) => digest(JSON.stringify(["account-email", account.id, account.email, nonce, value]));
  async function lockAccount(tx, personId, time) {
    // All requests and guesses for this account acquire the same database row lock.
    const locked = await tx.account.updateMany({ where: { personId, status: "ACTIVE" }, data: { updatedAt: time } });
    if (locked.count !== 1) throw error(403, "Email verification is unavailable for this account.");
    return tx.account.findUnique({ where: { personId }, select: { id: true, email: true, emailVerifiedAt: true } });
  }
  return {
    async request(personId) {
      configured(); sender.check();
      const time = now(), value = code(), nonce = randomUUID();
      const result = await prisma.$transaction(async (tx) => {
        const account = await lockAccount(tx, personId, time);
        if (account.emailVerifiedAt) return { verified: true, emailVerifiedAt: account.emailVerifiedAt };
        const previous = await tx.accountEmailChallenge.findUnique({ where: { accountId: account.id } });
        if (previous && previous.sentAt.getTime() > time.getTime() - MINUTE)
          throw error(429, "Please wait a minute before requesting another code.");
        // Same persisted recipient bucket as signup: a new browser/session cannot reset it.
        const hour = Math.floor(time.getTime() / (60 * MINUTE));
        const id = digest(account.email) + ":" + hour;
        const bucket = await tx.signupEmailDeliveryLimit.upsert({ where: { id },
          create: { id, count: 1, expiresAt: new Date((hour + 2) * 60 * MINUTE) },
          update: { count: { increment: 1 } },
        });
        if (bucket.count > 5) throw error(429, "Too many verification emails. Please try again later.");
        const expiresAt = new Date(time.getTime() + 10 * MINUTE);
        const data = { email: account.email, nonce, codeHash: hash(account, nonce, value), expiresAt, sentAt: time, attempts: 0 };
        await tx.accountEmailChallenge.upsert({ where: { accountId: account.id },
          create: { accountId: account.id, ...data }, update: data });
        return { account, nonce, expiresAt };
      });
      if (result.verified) return result;
      try { await sender.send({ email: result.account.email, code: value, deliveryId: nonce }); }
      catch {
        await prisma.accountEmailChallenge.updateMany({ where: { accountId: result.account.id, nonce }, data: { codeHash: null } });
        throw error(503, "Verification email could not be sent. Please wait a minute and try again.");
      }
      return { verified: false, email: result.account.email, expiresAt: result.expiresAt, retryAfterSeconds: 60 };
    },
    async verify(personId, value) {
      configured();
      const time = now();
      const emailVerifiedAt = await prisma.$transaction(async (tx) => {
        const account = await lockAccount(tx, personId, time);
        if (account.emailVerifiedAt) return null;
        const challenge = await tx.accountEmailChallenge.findUnique({ where: { accountId: account.id } });
        if (!challenge || challenge.email !== account.email || !challenge.codeHash || challenge.expiresAt <= time || challenge.attempts >= 5) return null;
        // Return failure from the transaction instead of throwing: wrong guesses must persist.
        await tx.accountEmailChallenge.update({ where: { accountId: account.id }, data: { attempts: { increment: 1 } } });
        const supplied = Buffer.from(hash(account, challenge.nonce, value), "hex");
        const expected = Buffer.from(challenge.codeHash, "hex");
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
        await tx.account.update({ where: { id: account.id }, data: { emailVerifiedAt: time } });
        await tx.accountEmailChallenge.update({ where: { accountId: account.id }, data: { codeHash: null } });
        return time;
      });
      if (!emailVerifiedAt) throw invalid();
      return { verified: true, emailVerifiedAt };
    },
  };
}
