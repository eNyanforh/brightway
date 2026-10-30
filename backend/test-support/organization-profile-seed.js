// Trusted isolated-test fixture only. Never used by application routes.
import { randomUUID } from "node:crypto";
export async function seedOrganizationProfile(db, organizationId, date = new Date()) {
  const photo = await db.organizationPhoto.create({ data: { organizationId, storageKey: `synthetic/${randomUUID()}.webp`, state: "CLAIMED", expiresAt: date } });
  return db.organization.update({ where: { id: organizationId }, data: { username: `org_${organizationId.replaceAll("-", "").slice(0, 20)}`, profilePhotoId: photo.id, profileReadyAt: date, profileVersion: 2, profileSetupStep: 5 } });
}
export async function clearOrganizationProfiles(db, ids) {
  await db.organization.updateMany({ where: { id: { in: ids } }, data: { profileReadyAt: null, profilePhotoId: null } });
  await db.organizationPhoto.deleteMany({ where: { organizationId: { in: ids } } });
}
