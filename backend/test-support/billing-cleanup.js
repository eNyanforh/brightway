// Privileged cleanup for the explicitly isolated synthetic test database only.
// Real application sessions cannot delete financial evidence.
export async function clearBilling(db, campusIds) {
  if (!process.env.TEST_DATABASE_URL) throw Error("Billing fixture cleanup requires the isolated test runner.");
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    const where = { campusId: { in: campusIds } };
    for (const model of ["billingLedgerEntry", "billingAudit", "campusPaymentAllocation", "billingAdjustment", "campusPayment", "billingCharge"]) await tx[model].deleteMany({ where });
    await tx.gradeSchoolPeriod.updateMany({ where, data: { billingSemesterId: null } });
    await tx.billingSemester.deleteMany({ where });
    await tx.billingAccount.deleteMany({ where });
  });
}
