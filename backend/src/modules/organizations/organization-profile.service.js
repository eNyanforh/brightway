import { randomUUID } from "node:crypto";
import { assertMfaSession } from "../auth/mfa.service.js";
import { processPhoto } from "../photos/photo.image.js";
import { failure, parse, requestId } from "./organization.schema.js";
import { PROFILE_MANAGE, organizationPhotoUrl, organizationProfileReady, organizationProfileSchema, organizationContactSchema, organizationSetupStep, profileVersion } from "./organization-profile.schema.js";
const conflict = () => failure(409, "This organization profile changed. Reload the saved profile before continuing.");
export function createOrganizationProfileService({ prisma, storage, process = processPhoto, now = () => new Date() }) {
  async function transaction(work) {
    try { return await prisma.$transaction(work); }
    catch (error) {
      if (error.code === "P2002") throw failure(409, "That organization username is unavailable. Choose another username.");
      if (error.code === "P2034") throw conflict();
      throw error;
    }
  }
  async function access(db, actorId, sessionId, id, write = false) {
    requestId(id);
    if (!actorId || !sessionId) throw failure(401, "Please sign in again.");
    // Account -> organization is the same lock order used by staffing/reviewer revocation.
    if (write && (await db.account.updateMany({ where: { id: actorId, status: "ACTIVE" }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw failure(403, "An active account is required.");
    const account = await db.account.findUnique({ where: { id: actorId } });
    if (account?.status !== "ACTIVE" || !await db.session.findFirst({ where: { id: sessionId, accountId: actorId, expiresAt: { gt: now() } } })) throw failure(401, "Please sign in again.");
    if ((await db.mfaFactor.findUnique({ where: { accountId: actorId } }))?.enabled) await assertMfaSession(db, actorId, sessionId, now());
    if (write && (await db.organization.updateMany({ where: { id, status: "ACTIVE", request: { status: "APPROVED" } }, data: { profileVersion: { increment: 0 } } })).count !== 1) throw failure(404, "Organization profile is unavailable.");
    const organization = await db.organization.findFirst({ where: { id, status: "ACTIVE", request: { status: "APPROVED" } } });
    if (!organization) throw failure(404, "Organization profile is unavailable.");
    const membership = await db.organizationMembership.findFirst({ where: { organizationId: id, accountId: actorId, enabled: true } });
    if (!membership) throw failure(403, "Active organization membership is required.");
    const canEdit = membership.role === "PRIMARY_ADMIN" || (membership.permissions ?? []).includes(PROFILE_MANAGE);
    if (write) {
      if (!canEdit || !account.emailVerifiedAt) throw failure(403, "Organization profile-management permission and verified email are required.");
      await assertMfaSession(db, actorId, sessionId, now());
    }
    return { organization, canEdit, role: membership.role };
  }
  const view = ({ organization: o, canEdit, role }) => ({ organization: { id: o.id, name: o.name, type: o.type, offersTraining: o.offersTraining }, role, canEdit, required: !organizationProfileReady(o), nextStep: organizationSetupStep(o), version: o.profileVersion, username: o.username, phoneNumber: o.phoneNumber ?? null, contactEmail: o.contactEmail ?? null, website: o.website ?? null, photo: o.profilePhotoId ? { id: o.profilePhotoId, url: organizationPhotoUrl(o.id, o.profilePhotoId) } : null });
  async function audit(db, id, actorId, action, entityId, data) { await db.organizationStaffAudit.create({ data: { organizationId: id, actorId, action, entityId, data } }); }
  const service = {
    async read(actorId, sessionId, id) { return transaction(async db => view(await access(db, actorId, sessionId, id))); },
    async saveUsername(actorId, sessionId, id, supplied) {
      const input = parse(organizationProfileSchema, supplied);
      return transaction(async db => {
        const scope = await access(db, actorId, sessionId, id, true), o = scope.organization;
        if (o.profileVersion !== input.expectedVersion) throw conflict();
        if (o.username === input.username) return view(scope);
        const occupied = await db.organization.findFirst({ where: { username: input.username, id: { not: id } }, select: { id: true } });
        if (occupied) throw failure(409, "That organization username is unavailable. Choose another username.");
        if ((await db.organization.updateMany({ where: { id, profileVersion: input.expectedVersion }, data: { username: input.username, profileSetupStep: Math.max(2, o.profileSetupStep || 1), profileVersion: { increment: 1 } } })).count !== 1) throw conflict();
        await audit(db, id, actorId, "PROFILE_USERNAME_CHANGED", id, { before: o.username, after: input.username });
        return view(await access(db, actorId, sessionId, id, true));
      });
    },
    async uploadPhoto(actorId, sessionId, id, expectedVersion, bytes, type) {
      parse(profileVersion, expectedVersion);
      const asset = await transaction(async db => {
        const { organization: o } = await access(db, actorId, sessionId, id, true);
        if (o.profileVersion !== expectedVersion) throw conflict();
        if (!o.username) throw failure(400, "Save the organization username first.");
        if (await db.organizationPhoto.count({ where: { organizationId: id, createdAt: { gte: new Date(+now() - 86400000) } } }) >= 20) throw failure(429, "Organization photo upload limit reached. Try again tomorrow.");
        storage.check();
        return db.organizationPhoto.create({ data: { organizationId: id, storageKey: `organization-photos/${id}/${randomUUID()}.webp`, expiresAt: new Date(+now() + 3600000) } });
      });
      try {
        const image = await process(bytes, type);
        await storage.put(asset.storageKey, image.bytes, "image/webp");
        return await transaction(async db => {
          const { organization: o } = await access(db, actorId, sessionId, id, true);
          if (o.profileVersion !== expectedVersion || !o.username) throw conflict();
          if ((await db.organizationPhoto.updateMany({ where: { id: asset.id, organizationId: id, state: "UPLOADING", expiresAt: { gt: now() } }, data: { state: "CLAIMED", byteSize: image.bytes.length, width: image.width, height: image.height } })).count !== 1) throw conflict();
          if ((await db.organization.updateMany({ where: { id, profileVersion: expectedVersion }, data: { profilePhotoId: asset.id, profileSetupStep: Math.max(3, o.profileSetupStep || 1), profileVersion: { increment: 1 } } })).count !== 1) throw conflict();
          if (o.profilePhotoId) await db.organizationPhoto.updateMany({ where: { id: o.profilePhotoId, organizationId: id, state: "CLAIMED" }, data: { state: "DELETE_PENDING" } });
          await audit(db, id, actorId, o.profileReadyAt ? "PROFILE_PHOTO_CHANGED" : "PROFILE_PHOTO_SAVED", asset.id, { previousPhotoId: o.profilePhotoId, photoId: asset.id });
          return view(await access(db, actorId, sessionId, id, true));
        });
      } catch (error) {
        // Even a put that reports failure may have written an object. Keep a durable retry record.
        await prisma.organizationPhoto.updateMany({ where: { id: asset.id, state: "UPLOADING" }, data: { state: "DELETE_PENDING" } }).catch(() => {});
        throw error;
      }
    },
    async saveContact(actorId, sessionId, id, supplied) {
      const input = parse(organizationContactSchema, supplied), step = { phoneNumber: 3, contactEmail: 4, website: 5 }[input.field];
      return transaction(async db => {
        const { organization: o } = await access(db, actorId, sessionId, id, true);
        if (o.profileVersion !== input.expectedVersion) throw conflict();
        if (!o.username || !o.profilePhotoId || (!organizationProfileReady(o) && organizationSetupStep(o) < step)) throw failure(409, "Complete or skip the earlier setup steps first.");
        const completing = !o.profileReadyAt && step === 5;
        const data = { [input.field]: input.value, profileSetupStep: Math.max(o.profileSetupStep || 3, Math.min(step + 1, 5)), profileVersion: { increment: 1 }, ...(completing ? { profileReadyAt: now() } : {}) };
        if ((await db.organization.updateMany({ where: { id, profileVersion: input.expectedVersion }, data })).count !== 1) throw conflict();
        // Record the changed field, not another copy of public contact values in the audit log.
        await audit(db, id, actorId, completing ? "PROFILE_SETUP_COMPLETED" : "PROFILE_CONTACT_CHANGED", id, { field: input.field, cleared: input.value === null });
        return view(await access(db, actorId, sessionId, id, true));
      });
    },
    async readPhoto(id, photoId) {
      requestId(id); requestId(photoId);
      const where = { id, profilePhotoId: photoId, status: "ACTIVE", request: { status: "APPROVED" } };
      if (!await prisma.organization.findFirst({ where, select: { id: true } })) throw failure(404, "Organization photo not found.");
      const photo = await prisma.organizationPhoto.findFirst({ where: { id: photoId, organizationId: id, state: "CLAIMED" }, select: { storageKey: true } });
      if (!photo) throw failure(404, "Organization photo not found.");
      const bytes = await storage.get(photo.storageKey);
      if (!await prisma.organization.findFirst({ where, select: { id: true } })) throw failure(404, "Organization photo not found.");
      return bytes;
    },
    async cleanup() {
      await prisma.organizationPhoto.updateMany({ where: { state: "UPLOADING", expiresAt: { lt: now() } }, data: { state: "DELETE_PENDING" } });
      const pending = await prisma.organizationPhoto.findMany({ where: { state: "DELETE_PENDING" }, orderBy: { updatedAt: "asc" }, take: 100 });
      let deleted = 0, failed = 0;
      for (const photo of pending) {
        if (await prisma.organization.count({ where: { profilePhotoId: photo.id } })) continue;
        try { await storage.delete(photo.storageKey); await prisma.organizationPhoto.updateMany({ where: { id: photo.id, state: "DELETE_PENDING" }, data: { state: "DELETED" } }); deleted++; }
        catch { failed++; }
      }
      return { deleted, failed };
    },
  };
  return service;
}
