// Privileged cleanup of this suite's synthetic records in the isolated test DB.
// Application services expose no deletion path for Campus audit or engine history.
export async function clearCampusFoundation(db, campusIds) {
  if (!process.env.TEST_DATABASE_URL) throw Error('Campus fixture cleanup requires the isolated test runner.');
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    const where = { campusId: { in: campusIds } };
    await tx.campusOnboarding.deleteMany({ where: { organizationId: { in: campusIds } } });
    await tx.campusPermissionGrant.deleteMany({ where });
    await tx.campusEngineConfiguration.deleteMany({ where });
    await tx.virtualCampusAudit.deleteMany({ where });
  });
}
