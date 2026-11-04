import { assertManagementSession, staffId } from "../src/modules/management/management-authority.js";
// Domain HTTP fixtures use synthetic authenticated management principals.
// Real password/challenge/cookie isolation is exercised by management-auth tests.
export function managementHttpFixture(f) {
  return { async authenticate(token) {
    const actor = f.actors?.[token] || (token === "reviewer" ? { id: f.reviewerId, sessionId: f.sessionId || f.reviewerSessionId } : null);
    if (!actor || !staffId(actor.id)) throw Object.assign(Error("Management sign-in required."), { status: 401 });
    const staff = await assertManagementSession(f.db, actor.id, actor.sessionId, f.now());
    return { realm: "management", staff: { id: staff.id, username: staff.username }, sessionId: actor.sessionId, mfaVerified: true };
  } };
}
