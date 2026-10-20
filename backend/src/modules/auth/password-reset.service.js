import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { hashPassword } from "./password.js";
import { createPasswordResetSender } from "./password-reset.sender.js";
export const resetAcknowledgement = { message: "If an eligible account uses that email, a reset code will be sent. Check your inbox and spam folder." };
const invalid = () => Object.assign(new Error("This code is invalid or expired. Request another code and try again."), { status: 400 });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const equal = (a, b) => typeof a === "string" && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
// A separate HMAC namespace prevents signup/verification codes from being reset proofs.
export function createPasswordResetService({ prisma, sender = createPasswordResetSender(), secret = process.env.EMAIL_VERIFICATION_SECRET, now = () => new Date(), hash = hashPassword, code = () => String(randomInt(0, 1000000)).padStart(6, "0") }) {
  function check() {
    if (typeof secret !== "string" || secret.length < 32) throw Object.assign(new Error("Password recovery is temporarily unavailable."), { status: 503 });
    sender.check();
  }
  const mac = (purpose, ...values) => createHmac("sha256", secret).update(JSON.stringify(["brightway-password-reset-v1", purpose, ...values])).digest("hex");
  const lock = (tx, key) => tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`password-reset:${key}`}, 0))`;
  return {
    async request(email) {
      check();
      email = email.trim().toLowerCase();
      const emailKey = mac("email", email), timestamp = now();
      const result = await prisma.$transaction(async (tx) => {
        await lock(tx, emailKey);
        const previous = await tx.passwordResetChallenge.findUnique({ where: { emailKey } });
        const sameWindow = previous && timestamp - previous.requestWindowStart < 3600000;
        // Deliberately identical acknowledgement for unknown emails and throttled requests.
        if (previous && (timestamp - previous.lastRequestedAt < 60000 || sameWindow && previous.requestCount >= 5)) return null;
        const account = await tx.account.findUnique({ where: { email }, select: { id: true, email: true, passwordHash: true, status: true } });
        const eligible = Boolean(account?.id && account.status === "ACTIVE" && account.email === email);
        // Unknown emails have a quota record only, never a generated reset code.
        const nonce = randomUUID(), value = eligible ? code() : randomBytes(32).toString("hex");
        const data = { nonce, accountId: eligible ? account.id : null, passwordFingerprint: eligible ? digest(account.passwordHash) : null, codeHash: mac("code", emailKey, nonce, value), expiresAt: new Date(+timestamp + 600000), ready: false, attempts: 0, consumedAt: null, requestWindowStart: sameWindow ? previous.requestWindowStart : timestamp, requestCount: sameWindow ? previous.requestCount + 1 : 1, lastRequestedAt: timestamp };
        await tx.passwordResetChallenge.upsert({ where: { emailKey }, create: { emailKey, ...data }, update: data });
        return eligible ? { emailKey, nonce, value, accountId: account.id, email: account.email, passwordFingerprint: data.passwordFingerprint } : null;
      });
      return {
        acknowledgement: { ...resetAcknowledgement },
        // Called after the HTTP response: provider latency/failure does not disclose account existence.
        // A process restart can interrupt delivery; users can request another code after 60 seconds.
        async deliver() {
          if (!result) return;
          try {
            // Recheck the exact account and challenge before contacting the email provider.
            const account = await prisma.account.findUnique({ where: { id: result.accountId }, select: { id: true, email: true, passwordHash: true, status: true } });
            const challenge = await prisma.passwordResetChallenge.findUnique({ where: { emailKey: result.emailKey } });
            if (!account || account.id !== result.accountId || account.email !== result.email || account.status !== "ACTIVE" || !equal(result.passwordFingerprint, digest(account.passwordHash))) return;
            if (!challenge || challenge.accountId !== account.id || challenge.nonce !== result.nonce || challenge.consumedAt || challenge.expiresAt <= now()) return;
            // Use only the saved account email as the delivery recipient.
            await sender.send({ email: account.email, code: result.value, deliveryId: result.nonce });
            await prisma.passwordResetChallenge.updateMany({ where: { emailKey: result.emailKey, nonce: result.nonce, consumedAt: null, expiresAt: { gt: now() } }, data: { ready: true } });
          } catch { /* Leave the challenge unusable. Never log its email, code or provider response. */ }
        },
      };
    },
    async confirm({ email, code: supplied, password }) {
      check();
      const emailKey = mac("email", email);
      const challenge = await prisma.$transaction(async (tx) => {
        await lock(tx, emailKey);
        const row = await tx.passwordResetChallenge.findUnique({ where: { emailKey } });
        if (!row || !row.ready || !row.accountId || row.consumedAt || row.expiresAt <= now() || row.attempts >= 5) return null;
        // Return failures after commit, so invalid-attempt counters are never rolled back.
        await tx.passwordResetChallenge.updateMany({ where: { emailKey, nonce: row.nonce }, data: { attempts: { increment: 1 } } });
        return equal(row.codeHash, mac("code", emailKey, row.nonce, supplied)) ? row : null;
      });
      if (!challenge) throw invalid();
      // Bounded expensive work happens outside the database transaction.
      const passwordHash = await hash(password);
      await prisma.$transaction(async (tx) => {
        const account = await tx.account.findUnique({ where: { id: challenge.accountId }, select: { id: true, email: true, passwordHash: true, status: true, emailVerifiedAt: true } });
        if (!account || account.status !== "ACTIVE" || mac("email", account.email) !== emailKey || !equal(challenge.passwordFingerprint, digest(account.passwordHash))) throw invalid();
        // The account lock also serializes reset with login's credential recheck/session write.
        const changed = await tx.account.updateMany({ where: { id: account.id, status: "ACTIVE", passwordHash: account.passwordHash }, data: { passwordHash } });
        if (changed.count !== 1) throw invalid();
        await lock(tx, emailKey);
        const claimed = await tx.passwordResetChallenge.updateMany({ where: { emailKey, nonce: challenge.nonce, ready: true, consumedAt: null, expiresAt: { gt: now() }, attempts: { lte: 5 } }, data: { consumedAt: now(), ready: false } });
        if (claimed.count !== 1) throw invalid();
        await tx.session.deleteMany({ where: { accountId: account.id } });
        await tx.passwordResetChallenge.updateMany({ where: { accountId: account.id, consumedAt: null }, data: { consumedAt: now(), ready: false } });
        await tx.passwordRecoveryAudit.create({ data: { accountId: account.id, action: "PASSWORD_RESET_ALL_SESSIONS_REVOKED" } });
      });
      // A notification failure cannot undo a committed reset or report a false failure.
      if (sender.notify) void sender.notify({ email, deliveryId: challenge.nonce }).catch(() => {});
      return { message: "Your password has been reset. Log in with your new password." };
    },
  };
}
