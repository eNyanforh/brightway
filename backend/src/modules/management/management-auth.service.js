import { createHmac, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from "../auth/password.js";
import { base32, fingerprint, matchTotp, recoveryCodes, recoveryHash, safeEqual, secretBox } from "../auth/mfa.crypto.js";
import { assertManagementSession, staffId, lockReviewActors } from "./management-authority.js";
const fail = (status, message) => Object.assign(Error(message), { status });
const invalid = () => fail(401, "Invalid or expired management authentication. Sign in again with a fresh code.");
const password = z.string().min(12).max(128);
export const managementLoginSchema = z.strictObject({ identifier: z.string().trim().toLowerCase().min(3).max(254), password: z.string().min(1).max(128) });
export const managementVerifySchema = z.strictObject({ code: z.string().trim().max(32), emailCode: z.string().regex(/^\d{6}$/).optional() });
export const managementResetSchema = managementVerifySchema.extend({ password });
export const managementBackupSchema = z.strictObject({ password: z.string().min(1).max(128), code: z.string().trim().max(32).optional() });
export const publicStaff = row => ({ id: row.id, username: row.username, fullName: row.fullName, isSuperAdmin: row.isSuperAdmin, realm: "management" });
const challengeHash = token => fingerprint(`management-challenge-v1:${token}`);
export const managementTokenHash = token => fingerprint(`management-session-v1:${token}`);
const validToken = token => /^[a-f0-9]{64}$/.test(token || "");

export function createManagementAuth({ prisma, key = process.env.MANAGEMENT_MFA_ENCRYPTION_KEY, emailSecret = process.env.MANAGEMENT_EMAIL_SECRET, sender, now = () => new Date(), verify = verifyPassword, hash = hashPassword }) {
  const box = secretBox(key);
  function emailHash(id, code) {
    if (typeof emailSecret !== "string" || emailSecret.length < 32) throw fail(503, "Configure management email verification before continuing.");
    return createHmac("sha256", emailSecret).update(`management-email-v1:${id}:${code}`).digest("hex");
  }
  async function lock(tx, id) {
    if (!staffId(id) || (await tx.managementStaff.updateMany({ where: { id, status: { in: ["PENDING", "ACTIVE"] } }, data: { failureCount: { increment: 0 } } })).count !== 1) throw invalid();
    return tx.managementStaff.findUnique({ where: { id } });
  }
  const audit = (tx, id, action, data) => tx.managementStaffAudit.create({ data: { actorId: id, targetStaffId: id, action, reason: "Management authentication lifecycle.", ...(data ? { data } : {}) } });
  function exhausted(staff) { return +now() - +staff.windowStart < 300000 && staff.failureCount >= 5; }
  async function resultBudget(tx, staff, success) {
    const same = +now() - +staff.windowStart < 300000;
    await tx.managementStaff.updateMany({ where: { id: staff.id }, data: { windowStart: success || !same ? now() : staff.windowStart, failureCount: success ? 0 : same ? staff.failureCount + 1 : 1 } });
  }
  async function proof(tx, staff, code) {
    if (exhausted(staff)) return false;
    let counter = null, backup = null;
    if (/^\d{6}$/.test(code || "")) counter = matchTotp(box.open(`management:${staff.id}`, staff.encryptedSecret), code, now(), staff.lastCounter);
    else if (/^[a-f0-9-]{24,27}$/i.test(code || "") && code.replaceAll("-", "").length === 24) backup = staff.recoveryHashes.find(value => safeEqual(value, recoveryHash(code)));
    const success = counter !== null || !!backup;
    await resultBudget(tx, staff, success);
    if (success) await tx.managementStaff.updateMany({ where: { id: staff.id, version: staff.version }, data: { ...(counter !== null ? { lastCounter: counter } : {}), ...(backup ? { recoveryHashes: staff.recoveryHashes.filter(value => value !== backup) } : {}) } });
    return success;
  }
  async function session(tx, staff) {
    const token = randomBytes(32).toString("hex"), expiresAt = new Date(+now() + 8 * 3600000);
    await tx.managementSession.create({ data: { staffId: staff.id, staffVersion: staff.version, tokenHash: managementTokenHash(token), mfaVerifiedAt: now(), expiresAt } });
    return { token, expiresAt, staff: publicStaff(staff) };
  }
  async function reserve(tx, staff, purpose) {
    const token = randomBytes(32).toString("hex"), code = String(randomInt(1000000)).padStart(6, "0");
    const secret = purpose === "ENROLL" ? base32(randomBytes(20)) : null;
    if (purpose !== "LOGIN") { box.check(); sender.check(); emailHash(staff.id, code); }
    await tx.managementChallenge.deleteMany({ where: { staffId: staff.id, purpose, consumedAt: null } });
    const row = await tx.managementChallenge.create({ data: { staffId: staff.id, tokenHash: challengeHash(token), purpose, staffVersion: staff.version, passwordFingerprint: fingerprint(staff.passwordHash), expiresAt: new Date(+now() + 600000), emailCodeHash: purpose === "LOGIN" ? null : emailHash(staff.id, code), setupSecret: secret ? box.seal(`management:${staff.id}`, secret) : null } });
    return { row, token, code, secret };
  }
  async function deliver(staff, reserved) {
    try { await sender.send({ email: staff.email, code: reserved.code, deliveryId: reserved.row.id, purpose: reserved.row.purpose }); }
    catch { await prisma.managementChallenge.updateMany({ where: { id: reserved.row.id }, data: { consumedAt: now() } }); throw fail(503, "Management verification email could not be delivered. Please retry later."); }
  }
  async function readChallenge(token, purposes) {
    if (!validToken(token)) throw invalid();
    const row = await prisma.managementChallenge.findUnique({ where: { tokenHash: challengeHash(token) } });
    if (!row || !purposes.includes(row.purpose)) throw invalid();
    return row;
  }
  return {
    async declareConflict(id, sessionId, input) {
      const parsed = z.strictObject({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/), reason: z.string().trim().min(10).max(500) }).safeParse(input);
      if (!parsed.success) throw fail(400, "Provide the related personal username and a clear conflict reason.");
      await assertManagementSession(prisma, id, sessionId, now(), true);
      const account = await prisma.account.findUnique({ where: { username: parsed.data.username }, select: { id: true } });
      if (!account) throw fail(404, "Personal account not found. Check the username.");
      return prisma.$transaction(async tx => {
        await lockReviewActors(tx, [id, account.id]); await assertManagementSession(tx, id, sessionId, now(), true);
        await tx.managementConflict.upsert({ where: { staffId_accountId: { staffId: id, accountId: account.id } }, create: { staffId: id, accountId: account.id, reason: parsed.data.reason }, update: {} });
        await audit(tx, id, "CONFLICT_DECLARED", { accountId: account.id }); return { recorded: true };
      });
    },
    async login(input) {
      const parsed = managementLoginSchema.safeParse(input); if (!parsed.success) throw invalid();
      const { identifier, password: supplied } = parsed.data;
      const candidate = await prisma.managementStaff.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } });
      const correct = await verify(supplied, candidate?.passwordHash || DUMMY_PASSWORD_HASH);
      if (!candidate || candidate.status === "DISABLED") throw invalid();
      const reserved = await prisma.$transaction(async tx => {
        const staff = await lock(tx, candidate.id);
        if (exhausted(staff)) return null;
        if (!correct || candidate.passwordHash !== staff.passwordHash || candidate.version !== staff.version) { await resultBudget(tx, staff, false); return null; }
        box.check();
        const purpose = staff.status === "PENDING" ? "ENROLL" : "LOGIN";
        if (purpose === "ENROLL" && await tx.managementStaffAudit.count({ where: { targetStaffId: staff.id, action: "ENROLLMENT_DELIVERY", createdAt: { gte: new Date(+now() - 3600000) } } }) >= 5) throw fail(429, "Management enrollment email limit reached. Try again later.");
        const result = await reserve(tx, staff, purpose);
        if (purpose === "ENROLL") await audit(tx, staff.id, "ENROLLMENT_DELIVERY");
        return { staff, ...result };
      });
      if (!reserved) throw invalid();
      if (reserved.row.purpose === "ENROLL") await deliver(reserved.staff, reserved);
      return { challengeToken: reserved.token, step: reserved.row.purpose === "ENROLL" ? "enroll" : "mfa", expiresAt: reserved.row.expiresAt, ...(reserved.secret ? { secret: reserved.secret, issuer: "BrightWay Management", accountLabel: reserved.staff.username } : {}) };
    },
    async complete(token, input) {
      const parsed = managementVerifySchema.safeParse(input); if (!parsed.success) throw invalid();
      const candidate = await readChallenge(token, ["LOGIN", "ENROLL"]);
      const result = await prisma.$transaction(async tx => {
        const staff = await lock(tx, candidate.staffId), row = await tx.managementChallenge.findUnique({ where: { id: candidate.id } });
        if (!row || row.consumedAt || row.expiresAt <= now() || row.attempts >= 5 || row.staffVersion !== staff.version || !safeEqual(row.passwordFingerprint, fingerprint(staff.passwordHash)) || exhausted(staff)) return null;
        await tx.managementChallenge.updateMany({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        let backupCodes;
        if (row.purpose === "ENROLL") {
          if (staff.status !== "PENDING" || !row.setupSecret || !safeEqual(row.emailCodeHash, emailHash(staff.id, parsed.data.emailCode || ""))) { await resultBudget(tx, staff, false); return null; }
          const counter = matchTotp(box.open(`management:${staff.id}`, row.setupSecret), parsed.data.code, now());
          if (counter === null) { await resultBudget(tx, staff, false); return null; }
          backupCodes = recoveryCodes();
          await tx.managementStaff.updateMany({ where: { id: staff.id, status: "PENDING", version: staff.version }, data: { status: "ACTIVE", encryptedSecret: row.setupSecret, emailVerifiedAt: now(), lastCounter: counter, recoveryHashes: backupCodes.map(recoveryHash), version: { increment: 1 }, failureCount: 0 } });
        } else if (staff.status !== "ACTIVE" || !await proof(tx, staff, parsed.data.code)) return null;
        await tx.managementChallenge.updateMany({ where: { id: row.id }, data: { consumedAt: now(), setupSecret: null, emailCodeHash: null } });
        await audit(tx, staff.id, row.purpose === "ENROLL" ? "ENROLLED" : "LOGIN_VERIFIED");
        const current = await tx.managementStaff.findUnique({ where: { id: staff.id } });
        return { ...await session(tx, current), ...(backupCodes ? { backupCodes } : {}) };
      });
      if (!result) throw invalid(); return result;
    },
    async authenticate(token) {
      if (!validToken(token)) throw invalid();
      const row = await prisma.managementSession.findUnique({ where: { tokenHash: managementTokenHash(token) }, include: { staff: true } });
      if (!row || row.expiresAt <= now() || row.staff.status !== "ACTIVE" || !row.staff.emailVerifiedAt || !row.staff.encryptedSecret || row.staffVersion !== row.staff.version || row.mfaVerifiedAt > now()) throw invalid();
      return { staff: publicStaff(row.staff), sessionId: row.id, mfaVerified: true, realm: "management" };
    },
    async logout(token, pending, recovery) {
      if (validToken(token)) await prisma.managementSession.deleteMany({ where: { tokenHash: managementTokenHash(token) } });
      for (const challenge of [pending, recovery]) if (validToken(challenge)) await prisma.managementChallenge.updateMany({ where: { tokenHash: challengeHash(challenge), consumedAt: null }, data: { consumedAt: now(), setupSecret: null, emailCodeHash: null } });
    },
    async requestRecovery(email) {
      const address = z.email().max(254).safeParse(typeof email === "string" ? email.trim().toLowerCase() : email);
      if (!address.success) throw fail(400, "Provide a valid management email address.");
      const staff = await prisma.managementStaff.findUnique({ where: { email: address.data } });
      if (!staff || staff.status !== "ACTIVE") return { accepted: true };
      const reserved = await prisma.$transaction(async tx => {
        const current = await lock(tx, staff.id);
        if (current.status !== "ACTIVE") throw invalid();
        if (await tx.managementStaffAudit.count({ where: { targetStaffId: staff.id, action: "RECOVERY_DELIVERY", createdAt: { gte: new Date(+now() - 3600000) } } }) >= 5) return null;
        const result = await reserve(tx, current, "RECOVERY"); await audit(tx, staff.id, "RECOVERY_DELIVERY"); return result;
      });
      if (!reserved) return { accepted: true };
      await deliver(staff, reserved); return { accepted: true, challengeToken: reserved.token };
    },
    async reset(token, input) {
      const parsed = managementResetSchema.safeParse(input); if (!parsed.success) throw invalid();
      const candidate = await readChallenge(token, ["RECOVERY"]);
      const passwordHash = await hash(parsed.data.password);
      const result = await prisma.$transaction(async tx => {
        const staff = await lock(tx, candidate.staffId), row = await tx.managementChallenge.findUnique({ where: { id: candidate.id } });
        if (!row || row.consumedAt || row.expiresAt <= now() || row.attempts >= 5 || row.staffVersion !== staff.version || !safeEqual(row.passwordFingerprint, fingerprint(staff.passwordHash)) || exhausted(staff)) return false;
        await tx.managementChallenge.updateMany({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        if (!safeEqual(row.emailCodeHash, emailHash(staff.id, parsed.data.emailCode || ""))) { await resultBudget(tx, staff, false); return false; }
        if (!await proof(tx, staff, parsed.data.code)) return false;
        await tx.managementStaff.updateMany({ where: { id: staff.id, version: staff.version }, data: { passwordHash, version: { increment: 1 } } });
        await tx.managementSession.deleteMany({ where: { staffId: staff.id } });
        await tx.managementChallenge.updateMany({ where: { staffId: staff.id }, data: { consumedAt: now(), setupSecret: null, emailCodeHash: null } });
        await audit(tx, staff.id, "PASSWORD_RESET"); return true;
      });
      if (!result) throw invalid(); return { reset: true };
    },
    async regenerate(id, sessionId, input) {
      const parsed = managementBackupSchema.safeParse(input); if (!parsed.success) throw invalid();
      const candidate = await assertManagementSession(prisma, id, sessionId, now());
      if (!await verify(parsed.data.password, candidate.passwordHash)) throw invalid();
      const result = await prisma.$transaction(async tx => {
        const staff = await lock(tx, id); await assertManagementSession(tx, id, sessionId, now());
        if (staff.passwordHash !== candidate.passwordHash) throw invalid();
        if (parsed.data.code) { if (!await proof(tx, staff, parsed.data.code)) return null; }
        else await assertManagementSession(tx, id, sessionId, now(), true);
        const codes = recoveryCodes(), version = staff.version + 1;
        await tx.managementStaff.updateMany({ where: { id }, data: { recoveryHashes: codes.map(recoveryHash), version } });
        await tx.managementSession.deleteMany({ where: { staffId: id, id: { not: sessionId } } });
        // Password-only retries cannot extend the recent-MFA window.
        await tx.managementSession.updateMany({ where: { id: sessionId, staffId: id }, data: { staffVersion: version, ...(parsed.data.code ? { mfaVerifiedAt: now() } : {}) } });
        await audit(tx, id, "BACKUPS_REGENERATED"); return { backupCodes: codes };
      });
      if (!result) throw invalid(); return result;
    },
  };
}
