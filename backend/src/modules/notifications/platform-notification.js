// Safe for earlier injected test doubles; real Prisma always exposes this model.
export async function notify(db, { recipientId, eventKey, kind, title, href, actorAccountId = null }) {
  if (!db.platformNotification) return;
  await db.platformNotification.createMany({ data: [{ recipientId, eventKey, kind, title, href, actorAccountId }], skipDuplicates: true });
}
