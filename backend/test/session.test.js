import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { rateLimit } from "express-rate-limit";
import {
  createSessionService,
  tokenHash,
  SESSION_LIFETIME_MS,
} from "../src/modules/auth/session.service.js";
import { createSessionRoutes } from "../src/modules/auth/session.routes.js";
import { createSessionCookieConfig } from "../src/modules/auth/session.http.js";
import { loginSchema } from "../src/modules/auth/login.schema.js";
import { DUMMY_PASSWORD_HASH } from "../src/modules/auth/password.js";

function fixture() {
  const account = {
    id: "account-1",
    username: "tester",
    email: "tester@example.com",
    status: "ACTIVE",
    emailVerifiedAt: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    person: {
      id: "person-1",
      firstName: "Test",
      middleName: null,
      lastName: "User",
    },
  };

  let timestamp = new Date("2026-10-10T00:00:00Z");
  const records = new Map();

  let candidate = {
    id: account.id,
    passwordHash: "stored-hash",
    status: "ACTIVE",
  };

  const verificationCalls = [];
  let failCreation = false;

  const prisma = {
    mfaFactor: { findUnique: async () => null },
    account: {
      findUnique: async ({ where, select }) => {
        if (where.username) {
          assert.equal(where.username, "tester");
        }

        if (where.email) {
          assert.equal(where.email, "tester@example.com");
        }

        return select.passwordHash
          ? candidate
          : { ...account };
      },

      updateMany: async ({ where, data }) => {
        if (
          !candidate ||
          where.passwordHash !== candidate.passwordHash ||
          account.status !== "ACTIVE"
        ) {
          return { count: 0 };
        }

        account.lastLoginAt = data.lastLoginAt;
        return { count: 1 };
      },
    },

    session: {
      create: async ({ data }) => {
        if (failCreation) {
          throw new Error("storage unavailable");
        }

        records.set(data.tokenHash, {
          id: data.tokenHash,
          ...data,
        });
      },

      deleteMany: async ({ where }) => {
        let count = 0;

        for (const [hash, record] of records) {
          const matches = where.tokenHash
            ? hash === where.tokenHash
            : (
              record.accountId === where.accountId &&
              record.expiresAt <= where.expiresAt.lte
            );

          if (matches) {
            records.delete(hash);
            count += 1;
          }
        }

        return { count };
      },
    },

    $queryRaw: async (strings, hash) => {
      assert.equal(strings.length, 2);
      assert.match(hash, /^[a-f0-9]{64}$/);

      const record = records.get(hash);
      if (!record) return [];

      return [{
        sessionId: record.id,
        expiresAt: record.expiresAt,
        accountId: account.id,
        username: account.username,
        email: account.email,
        status: account.status,
        emailVerifiedAt: account.emailVerifiedAt,
        createdAt: account.createdAt,
        personId: account.person.id,
        firstName: account.person.firstName,
        middleName: account.person.middleName,
        lastName: account.person.lastName,
      }];
    },

    $transaction: async (run) => run(prisma),
  };

  const sessions = createSessionService({
    prisma,
    now: () => timestamp,
    verify: async (password, hash) => {
      verificationCalls.push(hash);

      return (
        password === "correct password" &&
        hash === "stored-hash"
      );
    },
  });

  return {
    sessions,
    account,
    records,
    verificationCalls,

    advance: (ms) => {
      timestamp = new Date(timestamp.getTime() + ms);
    },

    missing: () => {
      candidate = null;
    },

    disable: (status) => {
      account.status = status;
      candidate.status = status;
    },

    disableDuringVerify: () => {
      candidate.status = "ACTIVE";
      account.status = "SUSPENDED";
    },

    fail: () => {
      failCreation = true;
    },
  };
}

async function withApi(sessions, run, options = {}) {
  const app = express();

  app.use(express.json());

  app.use(
    "/api/v1/auth",
    createSessionRoutes({
      sessions,
      clientUrl: "http://localhost:5173",
      nodeEnv: options.nodeEnv ?? "test",
      loginLimiter: options.loginLimiter,
    })
  );

  app.use((error, req, res, next) => {
    void next;

    res.status(error.status ?? 500).json({
      success: false,
      message: (
        error.status === 500 || !error.status
          ? "Internal server error"
          : error.message
      ),
    });
  });

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  const base =
    `http://127.0.0.1:${server.address().port}/api/v1/auth`;

  try {
    await run((path, init) => fetch(base + path, init));
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

const login = {
  identifier: "tester",
  password: "correct password",
};

const post = (body, extra = {}) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "http://localhost:5173",
    ...extra,
  },
  body: JSON.stringify(body),
});

test("login normalizes identifiers and rejects unknown fields", () => {
  assert.deepEqual(
    loginSchema.parse({
      identifier: " Tester@Example.com ",
      password: " keep spaces ",
    }),
    {
      identifier: "tester@example.com",
      password: " keep spaces ",
    }
  );

  assert.equal(
    loginSchema.safeParse({
      ...login,
      status: "ACTIVE",
    }).success,
    false
  );

  assert.equal(
    loginSchema.safeParse({
      ...login,
      password: "",
    }).success,
    false
  );
});

test("missing, wrong-password, suspended, and deactivated logins share a 401 response", async () => {
  for (const scenario of [
    "missing",
    "wrong",
    "SUSPENDED",
    "DEACTIVATED",
  ]) {
    const f = fixture();

    if (scenario === "missing") {
      f.missing();
    }

    if (["SUSPENDED", "DEACTIVATED"].includes(scenario)) {
      f.disable(scenario);
    }

    await assert.rejects(
      f.sessions.login({
        ...login,
        password: scenario === "wrong"
          ? "wrong password"
          : login.password,
      }),
      {
        status: 401,
        message: "Invalid username/email or password.",
      }
    );

    assert.equal(f.records.size, 0);
    assert.equal(f.verificationCalls.length, 1);

    if (scenario === "missing") {
      assert.equal(
        f.verificationCalls[0],
        DUMMY_PASSWORD_HASH
      );
    }
  }
});

test("email login stores a hash, rotates the previous token, and checks account status on access", async () => {
  const f = fixture();

  const first = await f.sessions.login({
    ...login,
    identifier: "tester@example.com",
  });

  assert.equal(first.token.length, 64);
  assert.equal(f.records.has(first.token), false);
  assert.equal(
    f.records.has(tokenHash(first.token)),
    true
  );

  const { lastLoginAt, ...publicAccount } = f.account;

  assert.ok(lastLoginAt instanceof Date);
  assert.deepEqual(
    (await f.sessions.authenticate(first.token)).account,
    publicAccount
  );

  const second = await f.sessions.login(
    login,
    first.token
  );

  assert.notEqual(second.token, first.token);

  await assert.rejects(
    f.sessions.authenticate(first.token),
    { status: 401 }
  );

  f.disable("SUSPENDED");

  await assert.rejects(
    f.sessions.authenticate(second.token),
    { status: 401 }
  );
});

test("authentication binds the token hash in one query and only returns public fields", async () => {
  const token = "a".repeat(64);
  const timestamp = new Date("2026-10-10T00:00:00Z");
  let calls = 0;

  const sessions = createSessionService({
    now: () => timestamp,
    prisma: {
      $queryRaw: async (strings, ...values) => {
        calls += 1;

        assert.deepEqual(values, [tokenHash(token)]);

        const sql = strings.join("");

        assert.equal(
          sql.includes(tokenHash(token)),
          false
        );
        assert.equal(sql.includes("passwordHash"), false);

        return [{
          sessionId: "session-1",
          expiresAt: new Date(timestamp.getTime() + 1000),
          accountId: "account-1",
          username: "tester",
          email: "tester@example.com",
          status: "ACTIVE",
          emailVerifiedAt: null,
          createdAt: timestamp,
          personId: "person-1",
          firstName: "Test",
          middleName: null,
          lastName: "User",
          passwordHash: "must not escape",
          tokenHash: "must not escape",
        }];
      },
    },
  });

  await assert.rejects(
    sessions.authenticate("invalid"),
    { status: 401 }
  );

  assert.equal(calls, 0);

  const result = await sessions.authenticate(token);

  assert.equal(calls, 1);
  assert.equal(result.account.createdAt, timestamp);
  assert.equal(result.account.person.middleName, null);
  assert.equal(
    JSON.stringify(result).includes("must not escape"),
    false
  );
});

test("authentication rejects unknown sessions and propagates database errors", async () => {
  const token = "b".repeat(64);
  const failure = new Error("database unavailable");

  const unknown = createSessionService({
    prisma: {
      $queryRaw: async () => [],
    },
  });

  await assert.rejects(
    unknown.authenticate(token),
    { status: 401 }
  );

  const failed = createSessionService({
    prisma: {
      $queryRaw: async () => {
        throw failure;
      },
    },
  });

  await assert.rejects(
    failed.authenticate(token),
    (error) => error === failure
  );

  const deactivated = fixture();
  const session = await deactivated.sessions.login(login);

  deactivated.disable("DEACTIVATED");

  await assert.rejects(
    deactivated.sessions.authenticate(session.token),
    { status: 401 }
  );
});

test("expired and malformed sessions fail; logout revokes a session and is idempotent", async () => {
  const f = fixture();
  const first = await f.sessions.login(login);

  f.advance(SESSION_LIFETIME_MS);

  await assert.rejects(
    f.sessions.authenticate(first.token),
    { status: 401 }
  );

  await assert.rejects(
    f.sessions.authenticate("invalid"),
    { status: 401 }
  );

  const second = await f.sessions.login(login);

  assert.equal(f.records.size, 1);

  await f.sessions.logout(second.token);

  await assert.rejects(
    f.sessions.authenticate(second.token),
    { status: 401 }
  );

  await f.sessions.logout(second.token);
  await f.sessions.logout(undefined);
});

test("status changes during verification prevent session creation", async () => {
  const f = fixture();

  f.disableDuringVerify();

  await assert.rejects(
    f.sessions.login(login),
    { status: 401 }
  );

  assert.equal(f.records.size, 0);
});

test("HTTP login, me, and logout use an HttpOnly cookie without exposing tokens", async () => {
  const f = fixture();

  await withApi(f.sessions, async (request) => {
    const response = await request(
      "/login",
      post({
        ...login,
        identifier: " TESTER ",
      })
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("cache-control"),
      "no-store"
    );

    const cookie = response.headers.getSetCookie().find((value) => value.startsWith("brightway_session="));

    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);

    const body = await response.json();

    assert.equal(body.data.account.username, "tester");
    assert.equal(
      JSON.stringify(body).includes("passwordHash"),
      false
    );
    assert.equal(
      JSON.stringify(body).includes("token"),
      false
    );

    const credentials = {
      Cookie: cookie.split(";")[0],
    };

    const me = await request("/me", {
      headers: credentials,
    });

    assert.equal(me.status, 200);
    assert.equal(
      me.headers.get("cache-control"),
      "no-store"
    );
    assert.equal(
      (await me.json()).data.account.id,
      f.account.id
    );

    const logout = await request(
      "/logout",
      post({}, credentials)
    );

    assert.equal(logout.status, 200);
    assert.match(
      logout.headers.get("set-cookie"),
      /Expires=Thu, 01 Jan 1970/
    );

    assert.equal(
      (await request("/me", {
        headers: credentials,
      })).status,
      401
    );
  });
});

test("login and logout reject missing and foreign origins", async () => {
  const f = fixture();

  await withApi(f.sessions, async (request) => {
    for (const route of ["/login", "/logout"]) {
      assert.equal(
        (await request(route, {
          method: "POST",
        })).status,
        403
      );

      assert.equal(
        (await request(
          route,
          post(login, {
            Origin: "https://attacker.example",
          })
        )).status,
        403
      );

      assert.equal(
        (await request(
          route,
          post(login, {
            Origin: "http://localhost:5173.attacker.example",
          })
        )).status,
        403
      );
    }

    assert.equal(
      (await request("/me")).status,
      401
    );
  });

  assert.equal(f.records.size, 0);
});

test("production cookies are Secure and use the host-only prefix", () => {
  const config = createSessionCookieConfig("production");

  assert.equal(
    config.name,
    "__Host-brightway_session"
  );
  assert.equal(config.options.secure, true);
  assert.equal(config.options.httpOnly, true);
  assert.equal(config.options.domain, undefined);
});

test("login rate limit blocks repeated failures", async () => {
  const f = fixture();

  const limiter = rateLimit({
    windowMs: 60000,
    limit: 2,
    skipSuccessfulRequests: true,
  });

  await withApi(
    f.sessions,
    async (request) => {
      assert.equal(
        (await request(
          "/login",
          post({
            ...login,
            password: "wrong",
          })
        )).status,
        401
      );

      assert.equal(
        (await request(
          "/login",
          post({
            ...login,
            password: "wrong",
          })
        )).status,
        401
      );

      assert.equal(
        (await request("/login", post(login))).status,
        429
      );
    },
    { loginLimiter: limiter }
  );
});

test("failed session persistence does not send a cookie", async () => {
  const f = fixture();
  f.fail();

  await withApi(f.sessions, async (request) => {
    const response = await request(
      "/login",
      post(login)
    );

    assert.equal(response.status, 500);
    assert.equal(
      response.headers.get("set-cookie"),
      null
    );
  });
});