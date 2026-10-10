import { createHash, randomBytes } from "node:crypto";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password.js";
import { publicAccountSelect } from "./registration.service.js";

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function validToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

function unauthorized(message = "Please log in to continue.") {
  return Object.assign(new Error(message), { status: 401 });
}

export function createSessionService({ prisma, verify = verifyPassword, now = () => new Date() }) {
  return {
    async login(input, previousToken) {
      const where = input.identifier.includes("@")
        ? { email: input.identifier }
        : { username: input.identifier };
      const candidate = await prisma.account.findUnique({
        where,
        select: { id: true, passwordHash: true, status: true },
      });

      const matches = await verify(input.password, candidate?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!candidate || !matches || candidate.status !== "ACTIVE") {
        throw unauthorized("Invalid username/email or password.");
      }

      const token = randomBytes(32).toString("hex");
      const timestamp = now();
      const expiresAt = new Date(timestamp.getTime() + SESSION_LIFETIME_MS);

      const account = await prisma.$transaction(async (tx) => {
        // Recheck status and hash atomically in case they changed during hashing.
        const updated = await tx.account.updateMany({
          where: { id: candidate.id, status: "ACTIVE", passwordHash: candidate.passwordHash },
          data: { lastLoginAt: timestamp },
        });
        if (updated.count !== 1) throw unauthorized("Invalid username/email or password.");

        await tx.session.deleteMany({ where: { accountId: candidate.id, expiresAt: { lte: timestamp } } });
        if (validToken(previousToken)) {
          await tx.session.deleteMany({ where: { tokenHash: tokenHash(previousToken) } });
        }
        await tx.session.create({ data: { accountId: candidate.id, tokenHash: tokenHash(token), expiresAt } });
        return tx.account.findUnique({ where: { id: candidate.id }, select: publicAccountSelect });
      });

      return { account, token, expiresAt };
    },

    async authenticate(token) {
      if (!validToken(token)) throw unauthorized();
      const session = await prisma.session.findUnique({
        where: { tokenHash: tokenHash(token) },
        select: { id: true, expiresAt: true, account: { select: publicAccountSelect } },
      });
      if (!session || session.expiresAt <= now() || session.account.status !== "ACTIVE") {
        throw unauthorized();
      }
      return { sessionId: session.id, account: session.account };
    },

    async logout(token) {
      if (validToken(token)) {
        await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
      }
    },
  };
}
