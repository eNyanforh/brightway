import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { processCoverPhoto } from "../src/modules/photos/photo.image.js";
import { createPhotoService } from "../src/modules/photos/photo.service.js";

test("cover processing rejects portraits and accepts a bounded landscape JPEG", async () => {
  const portrait = await sharp({ create: { width: 720, height: 1120, channels: 3,
    background: "#58728f" } }).jpeg().toBuffer();
  await assert.rejects(processCoverPhoto(portrait, "image/jpeg"), { status: 415 });
  const cover = await sharp({ create: { width: 1600, height: 520, channels: 3,
    background: "#58728f" } }).jpeg().toBuffer();
  const transformed = await processCoverPhoto(cover, "image/jpeg");
  assert.equal((await sharp(transformed.bytes).metadata()).format, "webp");
  assert.ok(transformed.width >= 700 && transformed.width <= 1920);
  assert.ok(transformed.height >= 240 && transformed.height <= 1080);
  await assert.rejects(processCoverPhoto(cover, "image/png"), { status: 415 });
});

test("cover upload is versioned, private and removable; blocked members cannot read", async () => {
  const personId = "owner-person";
  const accountId = "owner-account";
  const viewerId = "viewer-account";
  const photoId = "new-cover";
  const bytes = Buffer.from("webp-cover");
  let profile = { id: "profile", version: 3, coverPhotoId: null };
  let asset = null;
  let blocked = false;
  let writes = [];
  const db = {
    $transaction: callback => callback(db),
    photoAsset: {
      create: async ({ data }) => {
        asset = { ...data, id: photoId, state: "UPLOADING" };
        return asset;
      },
      updateMany: async ({ where, data }) => {
        if (where.id !== asset.id || (where.state && asset.state !== where.state)
            || (where.personId && where.personId !== asset.personId)) return { count: 0 };
        asset = { ...asset, ...data };
        return { count: 1 };
      },
      findFirst: async ({ where }) => where.id === asset?.id && where.personId === personId && asset.state === "CLAIMED"
        ? { storageKey: asset.storageKey } : null,
    },
    profile: {
      findUnique: async () => ({ ...profile }),
      updateMany: async ({ where, data }) => {
        if (where.version !== profile.version) return { count: 0 };
        profile = { ...profile, coverPhotoId: data.coverPhotoId, version: profile.version + 1 };
        return { count: 1 };
      },
    },
    account: {
      findUnique: async () => ({
        id: accountId, status: "ACTIVE", personId,
        person: { profile: { coverPhotoId: profile.coverPhotoId } },
      }),
    },
    networkPair: {
      findUnique: async () => ({ leftBlocked: blocked, rightBlocked: false }),
    },
  };
  const storage = {
    check: () => {},
    put: async (key, data) => { writes.push([key, data]); },
    get: async () => bytes,
  };
  const service = createPhotoService({
    prisma: db, storage,
    processCover: async () => ({ bytes, width: 1500, height: 500 }),
  });
  const result = await service.uploadCover(personId, 3, Buffer.from("input"), "image/jpeg");
  assert.deepEqual(result, { coverPhotoId: photoId, profileVersion: 4 });
  assert.equal(profile.coverPhotoId, photoId);
  assert.equal(asset.state, "CLAIMED");
  assert.equal(writes.length, 1);
  assert.deepEqual(await service.readCover(viewerId, "owner", photoId), bytes);
  blocked = true;
  await assert.rejects(service.readCover(viewerId, "owner", photoId), { status: 404 });
  blocked = false;
  await assert.rejects(service.uploadCover(personId, 3, Buffer.from("input"), "image/jpeg"), { status: 409 });
  assert.equal(profile.coverPhotoId, photoId);
  assert.deepEqual(await service.removeCover(personId, 4), { coverPhotoId: null, profileVersion: 5 });
  await assert.rejects(service.readCover(viewerId, "owner", photoId), { status: 404 });
});
