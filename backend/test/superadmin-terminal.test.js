import test from "node:test";
import assert from "node:assert/strict";
import { parseSuperadminCommand, hiddenPrompt, withTerminalAuthentication } from "../scripts/superadmin.js";
import { managementAuthFixture } from "../test-support/management-auth-fixture.js";
import { totp } from "../src/modules/auth/mfa.crypto.js";
test("terminal commands accept only explicit staff operations and reject secret-bearing or injected arguments", () => {
  assert.equal(parseSuperadminCommand(["bootstrap", "founder", "--reason", "Establish first management root."]).bootstrap, true);
  assert.equal(parseSuperadminCommand(["create", "agent_staff", "--by", "founder", "--reason", "Create authorized management Agent."]).create, true);
  assert.equal(parseSuperadminCommand(["staff", "agent_staff", "organization-agent", "grant", "--by", "founder", "--reason", "Assign investigation responsibility."]).enabled, true);
  for (const args of [["bootstrap", "founder", "--password", "secret"], ["create", "target", "--reason", "Unattributed staff provisioning."], ["staff", "target", "identity-reviewer", "grant", "--by", "founder", "--reason", "Line one\nLine two"], []]) assert.throws(() => parseSuperadminCommand(args));
});
test("hidden prompts refuse non-interactive input instead of accepting passwords from arguments or environment", async () => {
  await assert.rejects(hiddenPrompt("Password", { input: { isTTY: false }, output: { isTTY: false } }), /interactive terminal/);
});
test("terminal authentication uses independent staff password and MFA and always removes its temporary session", async () => {
  const f = managementAuthFixture(), root = await f.enroll(); f.advance(30000);
  const inputs = [f.password, totp(root.secret, BigInt(Math.floor(+f.now() / 30000)))];
  let actor;
  await withTerminalAuthentication({ prisma: f.db, authentication: f.auth, username: "root", prompt: async () => inputs.shift() }, async value => { actor = value; assert.equal(value.staffId, root.staff.id); });
  assert(!f.state.managementSession.some(row => row.id === actor.sessionId)); assert.equal(f.state.managementSession.length, 1);
  assert(f.state.managementChallenge.every(row => row.consumedAt));
});
test("a failed terminal operation leaves no bearer session or reusable pending challenge", async () => {
  const f = managementAuthFixture(), root = await f.enroll(); f.advance(30000);
  const inputs = [f.password, totp(root.secret, BigInt(Math.floor(+f.now() / 30000)))];
  await assert.rejects(withTerminalAuthentication({ prisma: f.db, authentication: f.auth, username: "root", prompt: async () => inputs.shift() }, async () => { throw Error("Operation failed"); }), /Operation failed/);
  assert.equal(f.state.managementSession.length, 1); assert(f.state.managementChallenge.every(row => row.consumedAt));
});
