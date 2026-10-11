import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  DUMMY_PASSWORD_HASH,
  verifyPassword,
} from "./password.js";
import { publicAccountSelect } from "./registration.service.js";

export const SESSION_LIFETIME_MS =
  7 * 24 * 60 * 60 * 1000;

export function tokenHash(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export function validToken(token) {
  return (
    typeof token === "string" &&
    /^[a-f0-9]{64}$/.test(token)
  );
}

function unauthorized(
  message = "Please log in to continue."
) {
  return Object.assign(new Error(message), {
    status: 401,
  });
}

export function createSessionService({
  prisma,
  verify = verifyPassword,
  now = () => new Date(),
}) {
  return {
    async login(input, previousToken) {
      const where = input.identifier.includes("@")
        ? { email: input.identifier }
        : { username: input.identifier };

      const candidate = await prisma.account.findUnique({
        where,
        select: {
          id: true,
          passwordHash: true,
          status: true,
        },
      });

      const matches = await verify(
        input.password,
        candidate?.passwordHash ?? DUMMY_PASSWORD_HASH
      );

      if (
        !candidate ||
        !matches ||
        candidate.status !== "ACTIVE"
      ) {
        throw unauthorized(
          "Invalid username/email or password."
        );
      }

      const token = randomBytes(32).toString("hex");
      const timestamp = now();

      const expiresAt = new Date(
        timestamp.getTime() + SESSION_LIFETIME_MS
      );

      const account = await prisma.$transaction(
        async (tx) => {
          // Recheck credentials and status after password verification.
          const updated = await tx.account.updateMany({
            where: {
              id: candidate.id,
              status: "ACTIVE",
              passwordHash: candidate.passwordHash,
            },
            data: {
              lastLoginAt: timestamp,
            },
          });

          if (updated.count !== 1) {
            throw unauthorized(
              "Invalid username/email or password."
            );
          }

          await tx.session.deleteMany({
            where: {
              accountId: candidate.id,
              expiresAt: {
                lte: timestamp,
              },
            },
          });

          if (validToken(previousToken)) {
            await tx.session.deleteMany({
              where: {
                tokenHash: tokenHash(previousToken),
              },
            });
          }

          await tx.session.create({
            data: {
              accountId: candidate.id,
              tokenHash: tokenHash(token),
              expiresAt,
            },
          });

          return tx.account.findUnique({
            where: {
              id: candidate.id,
            },
            select: publicAccountSelect,
          });
        }
      );

      return {
        account,
        token,
        expiresAt,
      };
    },

    async authenticate(token) {
      if (!validToken(token)) {
        throw unauthorized();
      }

      const timingEnabled =
        process.env.AUTH_TIMING === "true" &&
        process.env.NODE_ENV !== "production";

      const started = performance.now();
      let rows;

      try {
        // Load the session, account, and person in one query.
        // The token hash is bound as a parameter.
        rows = await prisma.$queryRaw`
          SELECT
            s."id" AS "sessionId",
            s."expiresAt" AS "expiresAt",
            a."id" AS "accountId",
            a."username" AS "username",
            a."email" AS "email",
            a."status"::text AS "status",
            a."emailVerifiedAt" AS "emailVerifiedAt",
            a."createdAt" AS "createdAt",
            p."id" AS "personId",
            p."firstName" AS "firstName",
            p."middleName" AS "middleName",
            p."lastName" AS "lastName"
          FROM "public"."Session" AS s
          INNER JOIN "public"."Account" AS a
            ON a."id" = s."accountId"
          INNER JOIN "public"."Person" AS p
            ON p."id" = a."personId"
          WHERE s."tokenHash" = ${tokenHash(token)}
          LIMIT 1
        `;
      } finally {
        if (timingEnabled) {
          console.info(
            `[auth timing] session lookup: ${
              (performance.now() - started).toFixed(1)
            } ms`
          );
        }
      }

      const session = rows[0];

      if (
        !session ||
        session.expiresAt <= now() ||
        session.status !== "ACTIVE"
      ) {
        throw unauthorized();
      }

      return {
        sessionId: session.sessionId,
        account: {
          id: session.accountId,
          username: session.username,
          email: session.email,
          status: session.status,
          emailVerifiedAt: session.emailVerifiedAt,
          createdAt: session.createdAt,
          person: {
            id: session.personId,
            firstName: session.firstName,
            middleName: session.middleName,
            lastName: session.lastName,
          },
        },
      };
    },

    async logout(token) {
      if (validToken(token)) {
        await prisma.session.deleteMany({
          where: {
            tokenHash: tokenHash(token),
          },
        });
      }
    },
  };
}