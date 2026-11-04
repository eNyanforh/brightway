import { randomUUID } from "node:crypto";
// Domain fixtures only. Enrollment and proof consumption use the actual auth service
// in management.database.test.js, rather than these unusable secrets/hashes.
export async function managementStaffFixture(db, data, capabilities = ["identity-reviewer"], date = new Date()) {
  return db.managementStaff.create({ data: { id: `mg_${randomUUID()}`, username: data.username, email: data.email, fullName: "Synthetic internal reviewer", passwordHash: "scrypt$unusable-domain-fixture", status: "ACTIVE", version: 1, emailVerifiedAt: date, encryptedSecret: "unusable-domain-fixture", capabilities } });
}
export async function managementSessionFixture(db, staff, date = new Date(), expiresAt = new Date(+date + 86400000)) {
  const current = await db.managementStaff.findUnique({ where: { id: staff.id } });
  return db.managementSession.create({ data: { staffId: staff.id, staffVersion: current.version, tokenHash: randomUUID(), mfaVerifiedAt: date, expiresAt } });
}
export async function cleanupManagementFixtures(db, ids) {
  const where = { staffId: { in: ids.filter(id => id?.startsWith("mg_")) } };
  await db.managementSession.deleteMany({ where }); await db.managementChallenge.deleteMany({ where }); await db.managementConflict.deleteMany({ where });
  await db.managementStaffAudit.deleteMany({ where: { targetStaffId: { in: where.staffId.in } } });
  await db.reviewPrincipal.deleteMany({ where }); await db.managementStaff.deleteMany({ where: { id: { in: where.staffId.in } } });
}
