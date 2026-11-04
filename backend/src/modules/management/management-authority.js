const fail = (status, message) => Object.assign(Error(message), { status });
export const staffId = id => typeof id === "string" && /^mg_[a-f0-9-]{36}$/.test(id);
export const capabilities = ["credential-reviewer", "identity-reviewer", "organization-agent", "organization-approver"];
export const permits = (staff, capability) => staff?.status === "ACTIVE" && !!staff.emailVerifiedAt && (staff.isSuperAdmin === true || staff.capabilities.includes(capability));

export async function managementPermission(db, id, capability) {
  if (!staffId(id)) throw fail(403, "A separate BrightWay management identity is required.");
  const staff = await db.managementStaff.findUnique({ where: { id } });
  if (!permits(staff, capability)) throw fail(403, "Current BrightWay management permission is required.");
  return staff;
}
export async function assertManagementSession(db, id, sessionId, timestamp = new Date(), fresh = false) {
  if (!staffId(id) || typeof sessionId !== "string" || !sessionId) throw fail(403, "Management MFA sign-in required.");
  const staff = await db.managementStaff.findUnique({ where: { id } });
  const session = await db.managementSession.findFirst({ where: { id: sessionId, staffId: id, expiresAt: { gt: timestamp } } });
  if (staff?.status !== "ACTIVE" || !staff.emailVerifiedAt || !staff.encryptedSecret || !session?.mfaVerifiedAt || session.staffVersion !== staff.version || session.mfaVerifiedAt > timestamp || (fresh && +timestamp - +session.mfaVerifiedAt > 300000)) throw fail(403, "A current management MFA sign-in is required.");
  return staff;
}
// Personal owner locks retain their existing order; management locks share that order.
export async function lockReviewActors(db, ids) {
  for (const id of [...new Set(ids)].sort()) {
    if (typeof id !== "string" || !id) throw fail(403, "An active actor is required.");
    const changed = staffId(id)
      ? await db.managementStaff.updateMany({ where: { id, status: "ACTIVE" }, data: { failureCount: { increment: 0 } } })
      : await db.account.updateMany({ where: { id, status: "ACTIVE" }, data: { identityRevision: { increment: 0 } } });
    if (changed.count !== 1) throw fail(403, "An active actor is required.");
  }
}
export async function conflictAccounts(db, id) {
  if (!staffId(id)) return [id];
  const staff = await db.managementStaff.findUnique({ where: { id } });
  if (!staff) throw fail(403, "Management access required.");
  const sameEmail = await db.account.findMany({ where: { email: { equals: staff.email, mode: "insensitive" } }, select: { id: true } });
  const declared = await db.managementConflict.findMany({ where: { staffId: id }, select: { accountId: true } });
  return [...new Set([...sameEmail.map(row => row.id), ...declared.map(row => row.accountId)])];
}
export async function assertNoSelfReview(db, id, accountId) {
  if ((await conflictAccounts(db, id)).includes(accountId)) throw fail(403, "You cannot review your own or a declared related account's submission.");
}
