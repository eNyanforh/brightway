import { organizationFixture } from "./organization-fixture.js";
import { createManagementProvisioning, createManagementBootstrap, createManagementService } from "../src/modules/management/management-access.service.js";
export function managementFixture() {
  const f = organizationFixture();
  f.db.$queryRaw = async () => [{ locked: 1 }];
  for (const actor of [f.actors.owner, f.actors.other]) {
    f.state.mfaFactor.push({ accountId: actor.id, enabled: true, version: 1, encryptedSecret: "synthetic-private-secret" });
    Object.assign(f.state.session.find(row => row.id === actor.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now() });
  }
  const bootstrap = createManagementBootstrap({ prisma: f.db, now: f.now });
  const provision = createManagementProvisioning({ prisma: f.db, now: f.now }), management = createManagementService({ prisma: f.db, now: f.now });
  return { ...f, provision, bootstrap, management,
    grant: (actor = f.actors.owner) => (f.state.managementAdministrator.some(r => r.isSuperAdmin) ? provision : bootstrap)({ username: actor.username, action: "grant", reason: "Establish authorized management access." }, f.state.managementAdministrator.some(r => r.isSuperAdmin) ? { accountId: f.actors.owner.id, sessionId: f.actors.owner.sessionId } : { accountId: actor.id, sessionId: actor.sessionId }),
    revoke: actor => provision({ username: actor.username, action: "revoke", reason: "Remove management access after role change." }, { accountId: actor.id, sessionId: actor.sessionId }),
    signIn(actor = f.actors.owner) { f.advance(1000); Object.assign(f.state.session.find(row => row.id === actor.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now(), expiresAt: new Date(+f.now() + 86400000) }); },
  };
}
