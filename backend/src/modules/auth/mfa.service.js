import { randomBytes } from "node:crypto";
import { base32, fingerprint, matchTotp, secretBox, recoveryCodes, recoveryHash, safeEqual } from "./mfa.crypto.js";
import { verifyPassword } from "./password.js";
import { publicAccountSelect } from "./registration.service.js";
const error = (status, message) => Object.assign(new Error(message), { status });
const denied = () => error(401, "Invalid, used or expired authentication code. Use a fresh app or backup code. After five failed checks, wait five minutes and sign in again.");
export function createMfaService({ prisma, key = process.env.MFA_ENCRYPTION_KEY, now = () => new Date(), verify = verifyPassword } = {}) {
  const box = secretBox(key);
  async function lockAccount(tx, accountId, passwordHash) {
    const changed = await tx.account.updateMany({ where: { id: accountId, status: "ACTIVE", ...(passwordHash ? { passwordHash } : {}) }, data: { status: "ACTIVE" } });
    if (changed.count !== 1) throw error(401, "Please log in again.");
  }
  async function passwordAccount(accountId, password) {
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, username: true, passwordHash: true, status: true } });
    if (!account || account.status !== "ACTIVE" || !(await verify(password, account.passwordHash))) throw error(401, "Your current password is incorrect.");
    return account;
  }
  async function proof(tx, factor, code, allowBackup = true) {
    const timestamp = now(), sameWindow = +timestamp - +factor.windowStart < 300000;
    if (sameWindow && factor.failureCount >= 5) return null;
    let method = null, counter = null, remaining = factor.recoveryHashes;
    if (/^\d{6}$/.test(code)) {
      counter = matchTotp(box.open(factor.accountId, factor.encryptedSecret), code, timestamp, factor.lastCounter);
      if (counter !== null) method = "TOTP";
    } else if (allowBackup && /^[a-f0-9-]{24,27}$/i.test(code) && code.replace(/-/g, "").length === 24) {
      const hash = recoveryHash(code); const index = remaining.findIndex((value) => safeEqual(value, hash));
      if (index !== -1) { method = "BACKUP_CODE"; remaining = remaining.filter((_, i) => i !== index); }
    }
    await tx.mfaFactor.updateMany({ where: { accountId: factor.accountId, version: factor.version }, data: { windowStart: method ? timestamp : sameWindow ? factor.windowStart : timestamp, failureCount: method ? 0 : sameWindow ? factor.failureCount + 1 : 1, ...(counter !== null ? { lastCounter: counter } : {}), ...(method === "BACKUP_CODE" ? { recoveryHashes: remaining } : {}) } });
    // Failures return after commit so failed-attempt budgets persist. Valid proofs reset that budget.
    return method;
  }
  async function audit(tx, accountId, action, method) { await tx.mfaAudit.create({ data: { accountId, action, method } }); }
  return {
    async status(accountId, sessionId) {
      const factor = await prisma.mfaFactor.findUnique({ where: { accountId } });
      const session = sessionId ? await prisma.session.findFirst({ where: { id: sessionId, accountId, expiresAt: { gt: now() } } }) : null;
      const recent = Boolean(factor?.enabled && session?.mfaVerifiedAt && session.mfaVersion === factor.version && session.mfaVerifiedAt <= now() && +now() - +session.mfaVerifiedAt <= 300000);
      return { enabled: Boolean(factor?.enabled), backupCodesRemaining: factor?.enabled ? factor.recoveryHashes.length : 0, ...(sessionId ? { canRegenerateWithPassword: recent } : {}) };
    },
    async begin(accountId, password) {
      box.check(); const account = await passwordAccount(accountId, password);
      return prisma.$transaction(async (tx) => {
        await lockAccount(tx, accountId, account.passwordHash);
        const previous = await tx.mfaFactor.findUnique({ where: { accountId } });
        if (previous?.enabled) throw error(409, "Two-factor authentication is already enabled.");
        const secret = base32(randomBytes(20));
        const data = { encryptedSecret: box.seal(accountId, secret), enabled: false, setupExpiresAt: new Date(+now() + 600000), lastCounter: -1n, recoveryHashes: [], version: (previous?.version ?? 0) + 1, windowStart: previous?.windowStart ?? now(), failureCount: previous?.failureCount ?? 0 };
        await tx.mfaFactor.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
        await audit(tx, accountId, "SETUP_STARTED", null);
        return { secret, accountLabel: `BrightWay:${account.username}`, issuer: "BrightWay", algorithm: "SHA1", digits: 6, period: 30, expiresAt: data.setupExpiresAt };
      });
    },
    async enable(accountId, sessionId, code) {
      box.check();
      const result = await prisma.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        const factor = await tx.mfaFactor.findUnique({ where: { accountId } });
        if (!factor || factor.enabled || !factor.setupExpiresAt || factor.setupExpiresAt <= now()) return null;
        const session = await tx.session.findFirst({ where: { id: sessionId, accountId, expiresAt: { gt: now() } } });
        if (!session) throw error(401, "Please log in again.");
        const method = await proof(tx, factor, code, false); if (!method) return null;
        const codes = recoveryCodes(), version = factor.version + 1;
        const enabled = await tx.mfaFactor.updateMany({ where: { accountId, enabled: false, version: factor.version, encryptedSecret: factor.encryptedSecret, setupExpiresAt: { gt: now() } }, data: { enabled: true, version, setupExpiresAt: null, recoveryHashes: codes.map(recoveryHash) } });
        if (enabled.count !== 1) throw error(409, "Authenticator setup expired or changed. Start setup again.");
        await tx.session.deleteMany({ where: { accountId, id: { not: sessionId } } });
        await tx.session.updateMany({ where: { id: sessionId, accountId }, data: { mfaVersion: version, mfaVerifiedAt: now() } });
        await tx.mfaLoginChallenge.deleteMany({ where: { accountId } });
        await audit(tx, accountId, "ENABLED", method);
        return { enabled: true, backupCodes: codes };
      });
      if (!result) throw denied(); return result;
    },
    async change(accountId, sessionId, { password, code }, disable = false) {
      box.check(); const account = await passwordAccount(accountId, password);
      const result = await prisma.$transaction(async (tx) => {
        await lockAccount(tx, accountId, account.passwordHash);
        const factor = await tx.mfaFactor.findUnique({ where: { accountId } });
        if (!factor?.enabled) throw error(409, "Two-factor authentication is not enabled.");
        const session = await tx.session.findFirst({ where: { id: sessionId, accountId, expiresAt: { gt: now() } } });
        if (!session || !session.mfaVerifiedAt || session.mfaVersion !== factor.version) throw error(401, "Please log in again with two-factor authentication.");
        // Recent second-factor assurance permits password-confirmed retries, including a lost regeneration response.
        const recentlyVerified = session.mfaVerifiedAt <= now() && +now() - +session.mfaVerifiedAt <= 300000;
        const method = !disable && !code && recentlyVerified ? "RECENT_MFA" : await proof(tx, factor, code);
        if (!method) return null;
        const codes = disable ? [] : recoveryCodes(), version = factor.version + 1;
        await tx.mfaFactor.updateMany({ where: { accountId }, data: { enabled: !disable, version, recoveryHashes: codes.map(recoveryHash), ...(disable ? { encryptedSecret: "", lastCounter: -1n } : {}) } });
        await tx.session.deleteMany({ where: { accountId, id: { not: sessionId } } });
        await tx.session.updateMany({ where: { id: sessionId }, data: { mfaVersion: disable ? 0 : version, mfaVerifiedAt: disable ? null : method === "RECENT_MFA" ? session.mfaVerifiedAt : now() } });
        await tx.mfaLoginChallenge.deleteMany({ where: { accountId } });
        await audit(tx, accountId, disable ? "DISABLED" : "BACKUP_CODES_REGENERATED", method);
        return { enabled: !disable, ...(disable ? {} : { backupCodes: codes, canRegenerateWithPassword: true }) };
      });
      if (!result) throw denied(); return result;
    },
    async challenge(tx, account, timestamp) {
      const factor = await tx.mfaFactor.findUnique({ where: { accountId: account.id } });
      if (!factor?.enabled) return null;
      box.check();
      // Keep only the latest pre-login proof for this account. It is not a session.
      await tx.mfaLoginChallenge.deleteMany({ where: { accountId: account.id } });
      const token = randomBytes(32).toString("hex"), expiresAt = new Date(+timestamp + 300000);
      await tx.mfaLoginChallenge.create({ data: { tokenHash: fingerprint(token), accountId: account.id, passwordFingerprint: fingerprint(account.passwordHash), factorVersion: factor.version, expiresAt } });
      return { mfaRequired: true, challengeToken: token, expiresAt };
    },
    async cancel(token) {
      if (/^[a-f0-9]{64}$/.test(token ?? "")) await prisma.mfaLoginChallenge.deleteMany({ where: { tokenHash: fingerprint(token) } });
    },
    async complete(token, code) {
      if (!/^[a-f0-9]{64}$/.test(token ?? "")) throw denied();
      box.check(); const tokenHash = fingerprint(token);
      const candidate = await prisma.mfaLoginChallenge.findUnique({ where: { tokenHash } });
      if (!candidate) throw denied();
      const result = await prisma.$transaction(async (tx) => {
        await lockAccount(tx, candidate.accountId);
        const row = await tx.mfaLoginChallenge.findUnique({ where: { tokenHash } });
        const account = await tx.account.findUnique({ where: { id: candidate.accountId }, select: { id: true, passwordHash: true } });
        const factor = await tx.mfaFactor.findUnique({ where: { accountId: candidate.accountId } });
        if (!row || row.consumedAt || row.expiresAt <= now() || row.attempts >= 5 || !factor?.enabled || factor.version !== row.factorVersion || !safeEqual(row.passwordFingerprint, fingerprint(account.passwordHash))) return null;
        await tx.mfaLoginChallenge.updateMany({ where: { tokenHash }, data: { attempts: { increment: 1 } } });
        const method = await proof(tx, factor, code); if (!method) return null;
        await tx.mfaLoginChallenge.updateMany({ where: { tokenHash }, data: { consumedAt: now() } });
        const sessionToken = randomBytes(32).toString("hex"), expiresAt = new Date(+now() + 604800000);
        await tx.session.create({ data: { tokenHash: fingerprint(sessionToken), accountId: account.id, expiresAt, mfaVersion: factor.version, mfaVerifiedAt: now() } });
        await tx.account.updateMany({ where: { id: account.id }, data: { lastLoginAt: now() } });
        await audit(tx, account.id, "LOGIN_VERIFIED", method);
        return { token: sessionToken, expiresAt, account: await tx.account.findUnique({ where: { id: account.id }, select: publicAccountSelect }) };
      });
      if (!result) throw denied(); return result;
    },
  };
}
export function requireMfa(req, res, next) {
  if (req.auth?.mfaVerified !== true || !req.auth.sessionId) return res.status(403).json({ success: false, message: "Enable two-factor authentication in Account security before using reviewer tools. If already enabled, log in again with your authenticator or a backup code." });
  next();
}
// Call after locking the account when making a privileged transactional decision.
export async function assertMfaSession(db, accountId, sessionId, timestamp = new Date()) {
  const factor = await db.mfaFactor.findUnique({ where: { accountId } });
  const session = await db.session.findFirst({ where: { id: sessionId, accountId, expiresAt: { gt: timestamp } } });
  if (!factor?.enabled || !session?.mfaVerifiedAt || session.mfaVersion !== factor.version) throw error(403, "A current two-factor session is required for reviewer actions.");
}
