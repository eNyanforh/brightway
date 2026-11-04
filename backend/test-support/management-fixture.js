import { organizationFixture } from "./organization-fixture.js";
import { createManagementService } from "../src/modules/management/management-access.service.js";
import { createManagementProvisioner } from "../src/modules/management/management-provisioning.js";
import { randomUUID } from "node:crypto";
export function managementFixture() {
  const f = organizationFixture(); f.db.$queryRaw = async () => [{ locked: 1 }];
  const owner = { username: "founder_management", id: null, sessionId: randomUUID() };
  const provisioner = createManagementProvisioner({ prisma: f.db, now: f.now });
  const management = createManagementService({ prisma: f.db, now: f.now });
  const actor = () => ({ staffId: owner.id, sessionId: owner.sessionId });
  const originalFind = f.db.managementSession.findUnique.bind(f.db.managementSession);
  f.db.managementSession.findUnique = async args => { const row = await originalFind(args); return row && args.include?.staff ? { ...row, staff: await f.db.managementStaff.findUnique({ where: { id: row.staffId } }) } : row; };
  return { ...f, actors: { ...f.actors, owner }, provisioner, management, actor,
    async grant() {
      const result = await provisioner.create({ username: owner.username, fullName: "Named Founder", email: "founder@management.example.invalid", passwordHash: "scrypt$synthetic", reason: "Establish separate management root." }, null, true);
      owner.id = result.id;
      const row = f.state.managementStaff.find(r => r.id === result.id);
      Object.assign(row, { status: "ACTIVE", version: 1, emailVerifiedAt: f.now(), encryptedSecret: "synthetic", failureCount: 0, windowStart: f.now(), lastCounter: -1n });
      f.state.managementStaff.splice(f.state.managementStaff.indexOf(row), 1); f.state.managementStaff.unshift(row);
      return result;
    },
    signIn() { f.advance(1000); const row = f.state.managementSession.find(s => s.id === owner.sessionId); const data = { id: owner.sessionId, staffId: owner.id, staffVersion: f.state.managementStaff[0].version, mfaVerifiedAt: f.now(), expiresAt: new Date(+f.now() + 86400000) }; if (row) Object.assign(row, data); else f.state.managementSession.push(data); },
  };
}
