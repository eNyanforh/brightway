export async function cleanupManagementAuthentication(prisma, timestamp = new Date()) {
  // Challenges contain encrypted enrollment secrets. Retain neither expired nor
  // consumed proofs; active staff factors and append-only audits are untouched.
  const challenges = await prisma.managementChallenge.deleteMany({ where: { OR: [{ expiresAt: { lte: timestamp } }, { consumedAt: { not: null } }] } });
  const sessions = await prisma.managementSession.deleteMany({ where: { expiresAt: { lte: timestamp } } });
  return { challenges: challenges.count, sessions: sessions.count };
}
