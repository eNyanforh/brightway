import test from "node:test";
import assert from "node:assert/strict";
import { validateTestDatabase } from "../scripts/check-database.js";

const env = {
  DATABASE_URL: "postgresql://app:example@ep-app-pooler.us-east-2.aws.neon.tech/brightway?sslmode=require",
  DIRECT_URL: "postgresql://app:example@ep-app.us-east-2.aws.neon.tech/brightway?sslmode=require",
  TEST_DATABASE_URL: "postgresql://test:example@ep-tests.us-east-2.aws.neon.tech/brightway?sslmode=require",
};

test("database command requires an explicit test URL and application URLs for comparison", () => {
  assert.throws(() => validateTestDatabase({}), /Set TEST_DATABASE_URL/);
  assert.throws(() => validateTestDatabase({ TEST_DATABASE_URL: env.TEST_DATABASE_URL }), /Configure DATABASE_URL and DIRECT_URL/);
});

test("database command rejects application destinations despite credentials, pooling or parameter differences", () => {
  for (const url of [env.DATABASE_URL, env.DIRECT_URL, "postgres://different:password@ep-app.us-east-2.aws.neon.tech:5432/brightway?schema=other"]) {
    assert.throws(() => validateTestDatabase({ ...env, TEST_DATABASE_URL: url }), /application database/);
  }
  assert.throws(() => validateTestDatabase({ DATABASE_URL: "postgres://a@localhost/app", DIRECT_URL: "postgres://a@127.0.0.1/app", TEST_DATABASE_URL: "postgres://b@[::1]:5432/app" }), /application database/);
});

test("database command accepts an isolated direct test branch or a separate local database", () => {
  assert.equal(validateTestDatabase(env), env.TEST_DATABASE_URL);
  const local = { DATABASE_URL: "postgres://a@localhost/app", DIRECT_URL: "postgres://a@localhost/app", TEST_DATABASE_URL: "postgres://a@localhost/app_test" };
  assert.equal(validateTestDatabase(local), local.TEST_DATABASE_URL);
});

test("database command rejects malformed URLs, host overrides and pooled test URLs without exposing credentials", () => {
  for (const url of ["not-a-url", "https://example.org/test", "postgres://a@localhost/", `${env.TEST_DATABASE_URL}&host=ep-app.us-east-2.aws.neon.tech`, env.TEST_DATABASE_URL.replace("ep-tests.", "ep-tests-pooler.")]) {
    assert.throws(() => validateTestDatabase({ ...env, TEST_DATABASE_URL: url }), (error) => !error.message.includes("example@") && !error.message.includes("sslmode"));
  }
});