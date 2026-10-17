import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { draftHash, validDraftToken } from "../photos/photo.service.js";
import { createSignupEmailSender } from "./signup-email.sender.js";

const MINUTE = 60000;
const failure = (status, message) => Object.assign(new Error(message), { status });
const invalid = () => failure(400, "That code is invalid or expired. Request a new code if needed.");
const required = () => failure(403, "Verify your email before creating your account.");

export function createSignupEmailService({
  prisma, sender = createSignupEmailSender(),
  secret = process.env.EMAIL_VERIFICATION_SECRET,
  now = () => new Date(), code = () => String(randomInt(0, 1000000)).padStart(6, "0"),
}) {
  function configured() {
    if (typeof secret !== "string" || secret.length < 32) throw failure(503, "Verification email is temporarily unavailable. Please try again later.");
  }
  const digest = (value) => createHmac("sha256", secret).update(value).digest("hex");
  const codeHash = (tokenHash, email, value) => digest(JSON.stringify([tokenHash, email, value]));
  function token(token) {
    if (!validDraftToken(token)) throw failure(401, "Your signup expired. Return to your details and try again.");
    return draftHash(token);
  }
  return {
    async request(draftToken, email) {
      configured(); sender.check();
      const tokenHash = token(draftToken);
      const time = now();
      const value = code();
      const hash = codeHash(tokenHash, email, value);
      const expiresAt = await prisma.$transaction(async (tx) => {
        const reserved = await tx.signupDraft.updateMany({
          where: { tokenHash, expiresAt: { gt: time }, emailSendCount: { lt: 5 },
            OR: [{ emailSentAt: null }, { emailSentAt: { lte: new Date(time.getTime() - MINUTE) } }] },
          data: { email, emailCodeHash: hash, emailCodeExpiresAt: new Date(time.getTime() + 10 * MINUTE),
            emailCodeAttempts: 0, emailSendCount: { increment: 1 }, emailSentAt: time,
            emailVerifiedAt: null, emailVerifiedUntil: null },
        });
        if (reserved.count !== 1) {
          const row = await tx.signupDraft.findUnique({ where: { tokenHash } });
          if (!row || row.expiresAt <= time) throw failure(401, "Your signup expired. Return to your details and try again.");
          throw failure(429, "Please wait before requesting another code. Each signup allows five emails.");
        }
        // Persisted per-recipient limit, shared by all signup drafts and API instances.
        const hour = Math.floor(time.getTime() / (60 * MINUTE));
        const bucket = await tx.signupEmailDeliveryLimit.upsert({
          where: { id: digest(email) + ":" + hour },
          create: { id: digest(email) + ":" + hour, count: 1, expiresAt: new Date((hour + 2) * 60 * MINUTE) },
          update: { count: { increment: 1 } },
        });
        if (bucket.count > 5) throw failure(429, "Too many verification emails. Please try again later.");
        const row = await tx.signupDraft.findUnique({ where: { tokenHash } });
        return new Date(Math.min(row.expiresAt.getTime(), time.getTime() + 10 * MINUTE));
      });
      try { await sender.send({ email, code: value, deliveryId: randomUUID() }); }
      catch {
        // A failed or ambiguous provider request cannot leave a usable challenge.
        await prisma.signupDraft.updateMany({ where: { tokenHash, emailCodeHash: hash },
          data: { emailCodeHash: null, emailCodeExpiresAt: null } });
        throw failure(503, "Verification email could not be sent. Please wait a minute and try again.");
      }
      return { expiresAt, retryAfterSeconds: 60 };
    },
    async verify(draftToken, email, value) {
      configured();
      const tokenHash = token(draftToken);
      const time = now();
      const accepted = await prisma.$transaction(async (tx) => {
        // Reserve each guess under the row lock; incorrect guesses must COMMIT.
        const attempt = await tx.signupDraft.updateMany({
          where: { tokenHash, email, expiresAt: { gt: time }, emailCodeExpiresAt: { gt: time },
            emailCodeHash: { not: null }, emailCodeAttempts: { lt: 5 } },
          data: { emailCodeAttempts: { increment: 1 } },
        });
        if (attempt.count !== 1) return false;
        const row = await tx.signupDraft.findUnique({ where: { tokenHash } });
        const supplied = Buffer.from(codeHash(tokenHash, email, value), "hex");
        const expected = Buffer.from(row.emailCodeHash, "hex");
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
        await tx.signupDraft.update({ where: { id: row.id }, data: {
          emailCodeHash: null, emailCodeExpiresAt: null, emailVerifiedAt: time,
          emailVerifiedUntil: new Date(Math.min(row.expiresAt.getTime(), time.getTime() + 10 * MINUTE)),
        } });
        return true;
      });
      if (!accepted) throw invalid();
      return { verified: true };
    },
    async requireVerified(draftToken, email) {
      const row = await prisma.signupDraft.findUnique({ where: { tokenHash: token(draftToken) } });
      const time = now();
      if (!row || row.email !== email || !row.emailVerifiedAt || !row.emailVerifiedUntil || row.emailVerifiedUntil <= time || row.expiresAt <= time) throw required();
    },
    async consume(tx, draftToken, email) {
      const time = now();
      // Called inside the photo/account transaction, after that transaction locks the draft.
      const row = await tx.signupDraft.findUnique({ where: { tokenHash: token(draftToken) } });
      if (!row || row.email !== email || !row.emailVerifiedAt || !row.emailVerifiedUntil || row.emailVerifiedUntil <= time) throw required();
      const verifiedAt = row.emailVerifiedAt;
      await tx.signupDraft.update({ where: { id: row.id }, data: { emailVerifiedAt: null, emailVerifiedUntil: null } });
      return verifiedAt;
    },
    async cleanup() {
      return prisma.signupEmailDeliveryLimit.deleteMany({ where: { expiresAt: { lt: now() } } });
    },
  };
}
