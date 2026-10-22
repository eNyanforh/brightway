import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { validateTestDatabase } from "./check-database.js";

export function sandboxEnvironment(input) {
  if (input.NODE_ENV === "production") {
    throw new Error(
      "Browser test accounts cannot be used in production mode."
    );
  }

  const url = validateTestDatabase(input);
  const client = new URL(
    input.CLIENT_URL || "http://localhost:5173"
  );

  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(
      client.hostname
    )
  ) {
    throw new Error(
      "Use a localhost frontend for this browser sandbox."
    );
  }

  return {
    ...input,
    NODE_ENV: "development",
    DATABASE_URL: url,
    DIRECT_URL: url,
    CLIENT_URL: client.origin,
    RESEND_API_KEY: "",
  };
}

async function main() {
  const mode = process.argv[2];

  if (
    !["setup", "serve"].includes(mode) ||
    process.argv.length !== 3
  ) {
    throw new Error(
      "From backend: node scripts/review-sandbox.js setup|serve"
    );
  }

  const backend = resolve(
    dirname(fileURLToPath(import.meta.url)),
    ".."
  );

  config({
    path: resolve(backend, ".env"),
    quiet: true,
  });

  const sandbox = sandboxEnvironment(process.env);

  if (mode === "serve") {
    console.log(
      "Starting BrightWay against the isolated TEST database."
    );
    console.log(
      "Email delivery is disabled for this process."
    );
    console.log(
      "Keep the ordinary backend stopped while using this sandbox."
    );

    const child = spawn(
      process.execPath,
      [resolve(backend, "src/server.js")],
      {
        cwd: backend,
        env: sandbox,
        stdio: "inherit",
      }
    );

    const stop = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    child.once("error", () => {
      console.error("Unable to start the sandbox backend.");
      process.exitCode = 1;
    });

    child.once("exit", (code) => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      process.exitCode = code ?? 1;
    });

    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { hashPassword } = await import(
    "../src/modules/auth/password.js"
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: sandbox.DATABASE_URL,
    }),
    transactionOptions: {
      maxWait: 10000,
      timeout: 15000,
    },
  });

  const marker = randomBytes(6).toString("hex");

  const users = [
    {
      username: `bw_member_${marker}`,
      role: "MEMBER",
      firstName: "Browser",
      lastName: "Applicant",
    },
    {
      username: `bw_reviewer_${marker}`,
      role: "CREDENTIAL_REVIEWER",
      firstName: "Browser",
      lastName: "Reviewer",
    },
  ];

  try {
    for (const user of users) {
      user.password = randomBytes(18).toString("base64url");
      user.passwordHash = await hashPassword(user.password);
    }

    await prisma.$transaction(async (tx) => {
      for (const user of users) {
        const account = await tx.account.create({
          data: {
            username: user.username,
            email: `${user.username}@example.invalid`,
            passwordHash: user.passwordHash,

            // Synthetic test fixture only.
            // This is not proof of mailbox ownership
            // or individual identity verification.
            emailVerifiedAt: new Date(),

            person: {
              create: {
                firstName: user.firstName,
                lastName: user.lastName,
                gender: "PREFER_NOT_TO_SAY",
                birthDate: new Date(
                  "2000-01-01T00:00:00Z"
                ),
              },
            },
          },
        });

        if (user.role !== "MEMBER") {
          await tx.account.update({
            where: {
              id: account.id,
            },
            data: {
              platformRole: user.role,
            },
          });

          await tx.reviewerRoleAudit.create({
            data: {
              targetAccountId: account.id,
              fromRole: "MEMBER",
              toRole: user.role,
            },
          });
        }
      }
    });

    console.log(
      "Created two sample accounts in the isolated TEST database."
    );

    for (const user of users) {
      console.log(`
${user.role}
Username: ${user.username}
Password: ${user.password}
`);
    }

    console.log(
      "Keep these temporary passwords locally. Do not commit or share them."
    );

    console.log(
      "Next: stop the ordinary backend and run:"
    );
    console.log(
      "node scripts/review-sandbox.js serve"
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href ===
    import.meta.url
) {
  main().catch(() => {
    console.error(
      "Sandbox setup/start failed. Check NODE_ENV, localhost CLIENT_URL, isolated TEST_DATABASE_URL, connectivity and pending migrations. No connection strings are printed."
    );

    process.exitCode = 1;
  });
}