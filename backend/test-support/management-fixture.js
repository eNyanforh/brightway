import { organizationFixture } from "./organization-fixture.js";
import { createManagementProvisioning, createManagementService } from "../src/modules/management/management-access.service.js";
export function managementFixture() {
  const f = organizationFixture(); f.state.manualIdentityReviewer = [];
  f.db.manualIdentityReviewer = { findUnique: async ({ where }) => structuredClone(f.state.manualIdentityReviewer.find(row => row.accountId === where.accountId) || null) };
  f.db.$queryRaw = async () => [{ locked: 1 }];
  for (const actor of [f.actors.owner, f.actors.other]) {
    f.state.mfaFactor.push({ accountId: actor.id, enabled: true, version: 1, encryptedSecret: "synthetic-private-secret" });
    Object.assign(f.state.session.find(row => row.id === actor.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now() });
  }
  const provision = createManagementProvisioning({ prisma: f.db, now: f.now }), management = createManagementService({ prisma: f.db, now: f.now });
  return { ...f, provision, management,
    grant: (actor = f.actors.owner) => provision({ username: actor.username, action: "grant", reason: "Establish authorized management access." }),
    revoke: actor => provision({ username: actor.username, action: "revoke", reason: "Remove management access after role change." }),
    signIn(actor = f.actors.owner) { f.advance(1000); Object.assign(f.state.session.find(row => row.id === actor.sessionId), { mfaVersion: 1, mfaVerifiedAt: f.now(), expiresAt: new Date(+f.now() + 86400000) }); },
  };
}
