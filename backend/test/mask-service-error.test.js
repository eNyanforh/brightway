import assert from "node:assert/strict";
import test from "node:test";
import { maskUnexpectedServiceError } from "../src/middleware/maskServiceError.js";

test("unexpected service errors preserve actionable codes only in development logs", () => {
  const logs = [];
  const original = Object.assign(new Error("postgres://private:secret@db.example.test/records?password=secret"), {
    name: "PrismaClientKnownRequestError",
    code: "P1001",
    cause: { code: "ECONNREFUSED", message: "secret" },
    meta: { driverAdapterError: { cause: { kind: "ConnectionError", secret: "never log" } } },
  });
  const wrapped = maskUnexpectedServiceError(original, "Service temporarily unavailable.", "/my-workspace", {
    development: true,
    logger: (...fields) => logs.push(fields),
  });
  assert.equal(wrapped.status, 503);
  assert.equal(wrapped.message, "Service temporarily unavailable.");
  assert.deepEqual(logs, [[ "Unexpected backend service failure:", {
    operation: "/my-workspace",
    originalName: "PrismaClientKnownRequestError",
    prismaCode: "P1001",
    causeCode: "ECONNREFUSED",
    adapterKind: "ConnectionError",
  }]]);
  assert.equal(JSON.stringify(logs).includes("secret"), false);
  assert.equal(JSON.stringify(logs).includes("postgres://"), false);
});

test("expected authorization failures stay untouched, without diagnostic logs", () => {
  const forbidden = Object.assign(new Error("Permission denied."), { status: 403 });
  const logs = [];
  assert.equal(maskUnexpectedServiceError(forbidden, "Service temporarily unavailable.", "/my-campus", {
    development: true, logger: value => logs.push(value),
  }), forbidden);
  assert.deepEqual(logs, []);
});

test("non-development unexpected errors remain masked with no original diagnostic details", () => {
  const logs = [];
  const original = Object.assign(new Error("private query"), { name: "Error", code: "P2028" });
  const wrapped = maskUnexpectedServiceError(original, "Campus temporarily unavailable.", "/my-campus", {
    development: false, logger: value => logs.push(value),
  });
  assert.equal(wrapped.status, 503);
  assert.equal(wrapped.message, "Campus temporarily unavailable.");
  assert.deepEqual(logs, []);
});

test("only structured codes and names can appear in development diagnostics", () => {
  const events = [];
  const original = { name: "PrismaError password=hidden", code: "P1001; SELECT * FROM accounts", cause: { code: "ECONNRESET" } };
  maskUnexpectedServiceError(original, "Unavailable.", "/my-campus", {
    development: true, logger: (_, fields) => events.push(fields),
  });
  assert.equal(events[0].originalName, undefined);
  assert.equal(events[0].prismaCode, undefined);
  assert.equal(events[0].causeCode, "ECONNRESET");
});
