import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import express from "express";
import { processPhoto } from "../src/modules/photos/photo.image.js";
import { createPhotoService, draftHash } from "../src/modules/photos/photo.service.js";
import { createPhotoRoutes, draftCookie } from "../src/modules/photos/photo.routes.js";
import { createR2Storage } from "../src/modules/photos/photo.storage.js";

function fakeDatabase() {
  const records = {
    signupDraft: [],
    photoAsset: [],
    profile: [],
  };

  const calls = [];

  const matches = (row, where) =>
    Object.entries(where ?? {}).every(([key, value]) => {
      if (key === "OR") {
        return value.some((condition) =>
          matches(row, condition),
        );
      }

      if (value && typeof value === "object") {
        if ("in" in value) {
          return value.in.includes(row[key]);
        }

        if ("gt" in value) {
          return row[key] > value.gt;
        }

        if ("lt" in value) {
          return row[key] < value.lt;
        }
      }

      return row[key] === value;
    });

  const db = { records, calls };
  db.account = {
    async findUnique({ where }) { const personId = where.personId ?? where.id?.replace(/^account-/, ""); return personId ? { id: `account-${personId}`, personId, status: "ACTIVE", photoReviewRequired: false } : null; },
    async updateMany() { return { count: 1 }; },
  };
  db.person = { async updateMany() { return { count: 1 }; } };

  for (const model of Object.keys(records)) {
    db[model] = {
      async findUnique({ where }) {
        return structuredClone(
          records[model].find((r) =>
            matches(r, where),
          ) ?? null,
        );
      },

      async findFirst(args) {
        return this.findUnique(args);
      },

      async findMany({ where, take }) {
        return structuredClone(
          records[model]
            .filter((r) => matches(r, where))
            .slice(0, take),
        );
      },

      async count({ where }) {
        return records[model].filter((r) =>
          matches(r, where),
        ).length;
      },

      async create({ data }) {
        const row = {
          id: `${model}-${records[model].length}`,
          state: "UPLOADING",
          personId: null,
          uploadCount: 0,
          ...data,
        };

        records[model].push(row);

        return structuredClone(row);
      },

      async updateMany({ where, data }) {
        calls.push({ model, where, data });

        const found = records[model].filter((r) =>
          matches(r, where),
        );

        for (const row of found) {
          for (const [key, value] of Object.entries(data)) {
            row[key] =
              value &&
              typeof value === "object" &&
              "increment" in value
                ? row[key] + value.increment
                : value;
          }
        }

        return { count: found.length };
      },

      async update(args) {
        await this.updateMany(args);

        return this.findUnique({
          where: args.where,
        });
      },
    };
  }

  db.$transaction = async (work) => {
    const saved = structuredClone(records);

    try {
      return await work(db);
    } catch (failure) {
      for (const name of Object.keys(records)) {
        records[name] = saved[name];
      }

      throw failure;
    }
  };

  return db;
}

const clock = () =>
  new Date("2026-10-12T00:00:00Z");

const storage = () => ({
  check() {},
  async put() {},
  async delete() {},

  async get() {
    return Buffer.from("private-image");
  },
});

const processed = async () => ({
  bytes: Buffer.from("encoded-webp"),
  width: 256,
  height: 256,
});

test("real image decoding converts a photo to WebP and removes metadata", async () => {
  const original = await sharp({
    create: {
      width: 256,
      height: 192,
      channels: 3,
      background: "blue",
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const result = await processPhoto(
    original,
    "image/jpeg",
  );

  const metadata = await sharp(
    result.bytes,
  ).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  assert.equal(result.width, 192);
  assert.equal(result.height, 256);

  await assert.rejects(
    processPhoto(original, "image/png"),
    { status: 415 },
  );

  await assert.rejects(
    processPhoto(
      Buffer.from("not an image"),
      "image/jpeg",
    ),
    { status: 415 },
  );

  await assert.rejects(
    processPhoto(
      Buffer.alloc(5 * 1024 * 1024 + 1),
      "image/png",
    ),
    { status: 413 },
  );

  const small = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: "blue",
    },
  })
    .png()
    .toBuffer();

  await assert.rejects(
    processPhoto(small, "image/png"),
    { status: 415 },
  );
});

test("draft capability is hashed, reused only until expiry and atomically limits upload attempts", async () => {
  const db = fakeDatabase();

  const photos = createPhotoService({
    prisma: db,
    storage: storage(),
    process: processed,
    now: clock,
  });

  const draft = await photos.begin();

  assert.notEqual(
    db.records.signupDraft[0].tokenHash,
    draft.token,
  );

  assert.equal(
    db.records.signupDraft[0].tokenHash,
    draftHash(draft.token),
  );

  assert.equal(
    (await photos.begin(draft.token)).token,
    draft.token,
  );

  for (let i = 0; i < 3; i++) {
    await photos.uploadDraft(
      draft.token,
      Buffer.from("test"),
      "image/png",
    );
  }

  await assert.rejects(
    photos.uploadDraft(
      draft.token,
      Buffer.from("test"),
      "image/png",
    ),
    { status: 429 },
  );

  assert.equal(db.records.photoAsset.length, 3);

  await assert.rejects(
    photos.uploadDraft(
      "malformed",
      Buffer.from("test"),
      "image/png",
    ),
    { status: 401 },
  );

  db.records.signupDraft[0].expiresAt = clock();

  await assert.rejects(
    photos.uploadDraft(
      draft.token,
      Buffer.from("test"),
      "image/png",
    ),
    { status: 401 },
  );
});

test("registration rejects foreign or reused photos and rolls back claim on creation failure", async () => {
  const db = fakeDatabase();

  const photos = createPhotoService({
    prisma: db,
    storage: storage(),
    process: processed,
    now: clock,
  });

  const first = await photos.begin();
  const second = await photos.begin();

  const asset = await photos.uploadDraft(
    first.token,
    Buffer.from("test"),
    "image/png",
  );

  let created = 0;

  const account = async () => {
    created++;

    return {
      id: "account",
      person: {
        id: "person",
      },
    };
  };

  await assert.rejects(
    photos.registerAsset(
      asset.photoAssetId,
      second.token,
      account,
    ),
    { status: 400 },
  );

  assert.equal(created, 0);

  const failure = new Error("duplicate account");

  await assert.rejects(
    photos.registerAsset(
      asset.photoAssetId,
      first.token,
      async () => {
        throw failure;
      },
    ),
    (e) => e === failure,
  );

  assert.equal(
    db.records.photoAsset[0].state,
    "READY",
  );

  assert(
    db.records.signupDraft[0].expiresAt > clock(),
  );

  await photos.registerAsset(
    asset.photoAssetId,
    first.token,
    account,
  );

  assert.equal(
    db.records.photoAsset[0].personId,
    "person",
  );

  assert.equal(
    db.records.photoAsset[0].reviewStatus,
    undefined,
  );

  assert.equal(
    db.records.profile[0].photoId,
    asset.photoAssetId,
  );

  await assert.rejects(
    photos.registerAsset(
      asset.photoAssetId,
      first.token,
      account,
    ),
    { status: 401 },
  );

  const claim = db.calls.find(
    (c) =>
      c.model === "photoAsset" &&
      c.data.state === "CLAIMED" &&
      c.where.draftId === db.records.signupDraft[0].id,
  );

  assert.equal(
    claim.where.draftId,
    db.records.signupDraft[0].id,
  );

  assert.equal(claim.where.personId, null);
});

test("failed storage cannot produce a ready photo and leaves retriable cleanup state", async () => {
  const db = fakeDatabase();
  const store = storage();

  store.put = async () => {
    throw Object.assign(
      new Error("storage unavailable"),
      { status: 503 },
    );
  };

  const photos = createPhotoService({
    prisma: db,
    storage: store,
    process: processed,
    now: clock,
  });

  const draft = await photos.begin();

  await assert.rejects(
    photos.uploadDraft(
      draft.token,
      Buffer.from("test"),
      "image/png",
    ),
    { status: 503 },
  );

  assert.equal(
    db.records.photoAsset[0].state,
    "DELETE_PENDING",
  );

  assert.deepEqual(
    await photos.cleanup(),
    { deleted: 1 },
  );

  assert.equal(
    db.records.photoAsset[0].state,
    "DELETED",
  );
});

test("owner replacements take effect immediately, reject stale versions and deny foreign image reads", async () => {
  const db = fakeDatabase();
  const store = storage();

  await db.profile.create({
    data: {
      personId: "owner",
      version: 4,
      photoId: "old-photo",
    },
  });

  await db.photoAsset.create({
    data: {
      id: "old-photo",
      personId: "owner",
      state: "CLAIMED",
      storageKey: "old",
    },
  });

  const photos = createPhotoService({
    prisma: db,
    storage: store,
    process: processed,
    now: clock,
  });

  await assert.rejects(
    photos.uploadOwner(
      "owner",
      3,
      Buffer.from("test"),
      "image/png",
    ),
    { status: 409 },
  );

  assert.equal(db.records.profile[0].version, 4);

  assert.equal(
    db.records.profile[0].photoId,
    "old-photo",
  );

  assert.equal(
    db.records.photoAsset[0].state,
    "CLAIMED",
  );

  const result = await photos.uploadOwner(
    "owner",
    4,
    Buffer.from("test"),
    "image/png",
  );

  assert.equal(db.records.profile[0].version, 5);

  assert.equal(
    db.records.photoAsset[0].state,
    "DELETE_PENDING",
  );

  assert.equal(result.reviewStatus, undefined);

  await assert.rejects(
    photos.readOwner("owner", "old-photo"),
    { status: 404 },
  );

  assert.equal(
    db.records.profile[0].photoId,
    result.photoAssetId,
  );

  await assert.rejects(
    photos.readOwner("other", result.photoAssetId),
    { status: 404 },
  );

  assert.equal(
    (
      await photos.readOwner(
        "owner",
        result.photoAssetId,
      )
    ).toString(),
    "private-image",
  );

  await photos.cleanup();

  assert.equal(
    db.records.photoAsset[0].state,
    "DELETED",
  );

  assert.equal(
    db.records.photoAsset.find(
      (asset) => asset.id === result.photoAssetId,
    ).state,
    "CLAIMED",
  );
});

test("cleanup protects referenced assets and ignores claimed photos", async () => {
  const db = fakeDatabase();
  const store = storage();
  const deleted = [];

  store.delete = async (key) => deleted.push(key);

  for (const [id, state] of [
    ["approved", "DELETE_PENDING"],
    ["claimed", "CLAIMED"],
    ["orphan", "READY"],
  ]) {
    await db.photoAsset.create({
      data: {
        id,
        state,
        storageKey: id,
        expiresAt: new Date(0),
      },
    });
  }

  await db.profile.create({
    data: {
      photoId: "approved",
    },
  });

  await createPhotoService({
    prisma: db,
    storage: store,
    now: clock,
  }).cleanup();

  assert.deepEqual(deleted, ["orphan"]);
});

test("R2 uses private server-side commands and handles missing config or dependency failure safely", async () => {
  const requests = [];

  const client = {
    async send(command) {
      requests.push(command.input);
      return {};
    },
  };

  const r2 = createR2Storage({
    config: {
      R2_BUCKET: "private-test",
    },
    client,
  });

  await r2.put(
    "photo.webp",
    Buffer.from("encoded"),
  );

  assert.equal(
    requests[0].Bucket,
    "private-test",
  );

  assert.equal(
    requests[0].ContentType,
    "image/webp",
  );

  assert.equal(requests[0].ACL, undefined);

  assert.throws(
    () =>
      createR2Storage({
        config: {},
      }).check(),
    { status: 503 },
  );

  client.send = async () => {
    throw new Error("secret connection details");
  };

  await assert.rejects(
    r2.delete("photo.webp"),
    (e) =>
      e.status === 503 &&
      !e.message.includes("secret"),
  );
});

test("photo HTTP mutations require trusted Origin and image reads require authentication", async () => {
  let uploads = 0;

  const app = express();

  const photos = {
    async begin() {
      return {
        token: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60000),
      };
    },

    async uploadDraft() {
      uploads++;
      return { photoAssetId: "test-id" };
    },

    async readOwner() {
      return Buffer.from("private");
    },
  };

  const sessions = {
    async authenticate(token) {
      if (token !== "owner") {
        throw Object.assign(
          new Error("Login required"),
          { status: 401 },
        );
      }

      return {
        account: {
          person: {
            id: "owner",
          },
        },
      };
    },
  };

  app.use(
    createPhotoRoutes({
      photos,
      sessions,
      clientUrl: "http://localhost:5173",
      nodeEnv: "test",
      limiter: (req, res, next) => next(),
    }),
  );

  app.use((e, req, res, next) => {
    void next;

    res.status(e.status ?? 500).json({
      success: false,
    });
  });

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) =>
    server.once("listening", resolve),
  );

  const base =
    `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal(
      (
        await fetch(base + "/auth/signup-drafts", {
          method: "POST",
        })
      ).status,
      403,
    );

    const begun = await fetch(
      base + "/auth/signup-drafts",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
        },
      },
    );

    assert.match(
      begun.headers.get("set-cookie"),
      /HttpOnly/,
    );

    assert.equal(
      (await begun.json()).data.token,
      undefined,
    );

    const headers = {
      Origin: "http://localhost:5173",
      "Content-Type": "image/png",
    };

    assert.equal(
      (
        await fetch(
          base + "/auth/signup-drafts/photo",
          {
            method: "POST",
            headers,
            body: "image",
          },
        )
      ).status,
      201,
    );

    assert.equal(uploads, 1);

    assert.equal(
      (
        await fetch(base + "/photos/test-id")
      ).status,
      401,
    );

    const image = await fetch(
      base + "/photos/test-id",
      {
        headers: {
          Cookie: "brightway_session=owner",
        },
      },
    );

    assert.equal(
      image.headers.get("cache-control"),
      "no-store",
    );

    assert.match(
      image.headers.get("content-type"),
      /image\/webp/,
    );

    assert.equal(
      (
        await fetch(
          base + "/auth/signup-drafts/photo",
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "image/svg+xml",
            },
            body: "svg",
          },
        )
      ).status,
      415,
    );

    assert.equal(
      (
        await fetch(
          base + "/auth/signup-drafts/photo",
          {
            method: "POST",
            headers,
            body: Buffer.alloc(
              5 * 1024 * 1024 + 1,
            ),
          },
        )
      ).status,
      413,
    );
  } finally {
    await new Promise((resolve) =>
      server.close(resolve),
    );
  }

  assert.equal(
    draftCookie("production").name,
    "__Host-brightway_signup",
  );

  assert.equal(
    draftCookie("production").options.secure,
    true,
  );
});

test("signup country and photo are stored together and profile failure rolls back the claim", async () => {
  const db = fakeDatabase();

  const photos = createPhotoService({
    prisma: db,
    storage: storage(),
    process: processed,
    now: clock,
  });

  const draft = await photos.begin();

  const asset = await photos.uploadDraft(
    draft.token,
    Buffer.from("test"),
    "image/png",
  );

  const create = async () => ({
    id: "account",
    person: {
      id: "person",
    },
  });

  const writeProfile = db.profile.create;

  db.profile.create = async () => {
    throw new Error("profile write failed");
  };

  await assert.rejects(
    photos.registerAsset(
      asset.photoAssetId,
      draft.token,
      create,
      { countryCode: "LR" },
    ),
    /profile write failed/,
  );

  assert.equal(db.records.profile.length, 0);

  assert.equal(
    db.records.photoAsset[0].state,
    "READY",
  );

  assert.equal(
    db.records.photoAsset[0].personId,
    null,
  );

  assert(
    db.records.signupDraft[0].expiresAt > clock(),
  );

  db.profile.create = writeProfile;

  await photos.registerAsset(
    asset.photoAssetId,
    draft.token,
    create,
    {
      countryCode: "LR",
      version: 99,
    },
  );

  assert.equal(
    db.records.profile[0].countryCode,
    "LR",
  );

  assert.equal(
    db.records.profile[0].photoId,
    asset.photoAssetId,
  );

  assert.equal(
    db.records.profile[0].version,
    undefined,
  );
});
