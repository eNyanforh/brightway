import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import express from "express";
import { createPhotoRoutes } from "../src/modules/photos/photo.routes.js";
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

test("cover HTTP routes accept ordinary nonzero profile versions, authorize, and serve image bytes", async () => {
  const calls = [];
  const photos = {
    uploadCover: async (personId, version, bytes, type) => {
      calls.push({ kind: "upload", personId, version, length: bytes.length, type });
      return { coverPhotoId: "image-one", profileVersion: version + 1 };
    },
    removeCover: async (personId, version) => {
      calls.push({ kind: "remove", personId, version });
      return { coverPhotoId: null, profileVersion: version + 1 };
    },
    readCover: async (viewerId, username, id) => {
      calls.push({ kind: "read", viewerId, username, id });
      return Buffer.from("cover-bytes");
    },
  };
  const app = express();
  app.use("/api/v1", createPhotoRoutes({
    photos,
    sessions: {
      authenticate: async token => {
        if (token !== "active-session") throw Object.assign(Error("Sign in"), { status: 401 });
        return { account: { id: "owner-account", person: { id: "owner-person" } }, sessionId: "session" };
      },
    },
    clientUrl: "http://localhost:5173",
    nodeEnv: "test",
    limiter: (req, res, next) => next(),
  }));
  app.use((err, req, res, next) => { void next; res.status(err.status || 500).json({ success: false, message: err.message }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const headers = {
    Origin: "http://localhost:5173",
    Cookie: "brightway_session=active-session",
    "Content-Type": "image/png",
    "X-Profile-Version": "42",
  };
  try {
    const upload = await fetch(base + "/profile/me/cover", { method: "POST", headers, body: Buffer.from("sample cover") });
    assert.equal(upload.status, 201);
    assert.deepEqual((await upload.json()).data, { coverPhotoId: "image-one", profileVersion: 43 });
    assert.deepEqual(calls[0], { kind: "upload", personId: "owner-person", version: 42, length: 12, type: "image/png" });

    const invalid = await fetch(base + "/profile/me/cover", {
      method: "POST", headers: { ...headers, "X-Profile-Version": "4\\d" }, body: Buffer.from("sample cover"),
    });
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 1);

    const missingSession = await fetch(base + "/profile/me/cover", {
      method: "POST", headers: { ...headers, Cookie: "" }, body: Buffer.from("sample cover"),
    });
    assert.equal(missingSession.status, 401);

    const image = await fetch(base + "/profiles/OWNER/cover/image-one", { headers: { Cookie: headers.Cookie } });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/webp");
    assert.equal(await image.text(), "cover-bytes");
    assert.deepEqual(calls[1], { kind: "read", viewerId: "owner-account", username: "owner", id: "image-one" });

    const removed = await fetch(base + "/profile/me/cover", {
      method: "DELETE", headers: { Cookie: headers.Cookie, Origin: headers.Origin, "X-Profile-Version": "43" },
    });
    assert.equal(removed.status, 200);
    assert.deepEqual((await removed.json()).data, { coverPhotoId: null, profileVersion: 44 });
    assert.deepEqual(calls[2], { kind: "remove", personId: "owner-person", version: 43 });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
