import { organizationFixture } from "./organization-fixture.js";
import { createManagementAuth } from "../src/modules/management/management-auth.service.js";
import { createManagementProvisioner } from "../src/modules/management/management-provisioning.js";
import { totp } from "../src/modules/auth/mfa.crypto.js";
export function managementAuthFixture() {
  const f = organizationFixture(); f.db.$queryRaw = async () => [{ locked: 1 }];
  f.state.managementStaff = []; f.state.managementSession = []; const deliveries = [];
  const sender = { check() {}, async send(message) { deliveries.push(message); } };
  const config = { prisma: f.db, now: f.now, key: "a".repeat(64), emailSecret: "separate-management-email-secret".repeat(2), sender, verify: async (value, encoded) => encoded === `scrypt$test:${value}`, hash: async value => `scrypt$test:${value}` };
  const auth = createManagementAuth(config), provisioner = createManagementProvisioner({ prisma: f.db, now: f.now });
  const findSession = f.db.managementSession.findUnique.bind(f.db.managementSession);
  f.db.managementSession.findUnique = async args => { const result = await findSession(args); return result && args.include?.staff ? { ...result, staff: await f.db.managementStaff.findUnique({ where: { id: result.staffId } }) } : result; };
  const password = "management passphrase";
  const input = username => ({ username, fullName: `Named ${username}`, email: `${username}@management.example.invalid`, passwordHash: `scrypt$test:${password}`, reason: "Separate management fixture provisioning." });
  return { ...f, auth, provisioner, config, deliveries, sender, password, input,
    async enroll(username = "root", actor = null) {
      const staff = await provisioner.create(input(username), actor, !actor);
      const pending = await auth.login({ identifier: username, password });
      const secret = pending.secret;
      const result = await auth.complete(pending.challengeToken, { code: totp(secret, BigInt(Math.floor(+f.now() / 30000))), emailCode: deliveries.at(-1).code });
      const verified = await auth.authenticate(result.token);
      return { ...result, secret, actor: { staffId: staff.id, sessionId: verified.sessionId } };
    },
    async signIn(username, secret) {
      f.advance(30000); const challenge = await auth.login({ identifier: username, password });
      return auth.complete(challenge.challengeToken, { code: totp(secret, BigInt(Math.floor(+f.now() / 30000))) });
    },
  };
}
