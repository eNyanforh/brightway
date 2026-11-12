import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { processPhoto } from "../photos/photo.image.js";
import { processEvidence } from "../credentials/evidence.process.js";
import { assertNetworkSession, lockNetworkAccounts } from "../network/network-authority.js";
import { fail } from "../network/network.schema.js";

export const POST_MEDIA_MAX_IMAGES = 4;
export const POST_MEDIA_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const POST_MEDIA_MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const POST_MEDIA_MAX_DRAFTS = 8;
export const postMediaSelect = {
  id: true, kind: true, name: true, contentType: true, size: true, pageCount: true,
};
export const postMediaIds = z.array(z.uuid()).max(POST_MEDIA_MAX_IMAGES)
  .refine(ids => new Set(ids).size === ids.length, "Each attachment may only be used once.");

const mediaTypes = new Map([
  ["image/jpeg", "IMAGE"], ["image/png", "IMAGE"], ["image/webp", "IMAGE"],
  ["video/mp4", "VIDEO"], ["video/webm", "VIDEO"],
  ["application/pdf", "DOCUMENT"],
]);
const videoSignature = (bytes, type) => type === "video/mp4"
  ? bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp"
  : bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
const sanitizeName = (name, type) => {
  const extension = ({ "image/webp": ".webp", "video/mp4": ".mp4",
    "video/webm": ".webm", "application/pdf": ".pdf" })[type] ?? ".webp";
  const base = String(name || "Attachment").replace(/[\\/\x00-\x1f\x7f"<>]/g, "_")
    .replace(/\.[^/.]*$/, "").trim().slice(0, 140) || "Attachment";
  return base + extension;
};
function requireKindSelection(rows) {
  const kinds = new Set(rows.map(file => file.kind));
  if (rows.length > POST_MEDIA_MAX_IMAGES || kinds.size > 1 ||
      (rows.length > 1 && kinds.has("VIDEO")) || (rows.length > 1 && kinds.has("DOCUMENT"))) {
    throw fail(400, "Add up to four images, or one video, or one PDF to a post.");
  }
}

// Only authenticated readers receive asset URLs, served as bounded byte ranges
// from private R2. No presigned/public object-storage links are exposed.
export function createPostMediaService({
  prisma, storage, now = () => new Date(),
  processImage = processPhoto, processPdf = processEvidence,
} = {}) {
  if (!prisma || !storage) throw Error("Post media needs a database and storage.");

  return {
    async upload(actor, query, bytes, contentType) {
      const parsed = z.strictObject({ name: z.string().trim().min(1).max(160) }).safeParse(query);
      if (!parsed.success) throw fail(400, "Choose a filename.");
      const kind = mediaTypes.get(contentType);
      if (!kind) throw fail(415, "Use JPEG, PNG, WebP, MP4, WebM or PDF.");
      const maxSize = kind === "VIDEO" ? POST_MEDIA_MAX_VIDEO_BYTES : POST_MEDIA_MAX_DOCUMENT_BYTES;
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxSize) {
        throw fail(413, kind === "VIDEO" ? "Choose a video up to 25 MiB." : "Choose an image or PDF up to 5 MiB.");
      }
      await assertNetworkSession(prisma, actor, now);
      storage.check();
      // Serialize upload quotas per account. Deleting a failed attempt never
      // restores the rate/byte budget in the rolling 24-hour window.
      await prisma.$transaction(async tx => {
        await lockNetworkAccounts(tx, [actor.accountId]);
        await assertNetworkSession(tx, actor, now);
        const since = new Date(+now() - 86400000);
        const [budget, drafts] = await Promise.all([
          tx.postMediaUploadAttempt.aggregate({
            where: { ownerId: actor.accountId, createdAt: { gte: since } },
            _count: true, _sum: { inputSize: true },
          }),
          tx.postMedia.count({
            where: { ownerId: actor.accountId, postId: null, discardedAt: null, createdAt: { gte: since } },
          }),
        ]);
        if (budget._count >= 40 || (budget._sum.inputSize || 0) + bytes.length > 200 * 1024 * 1024) {
          throw fail(429, "Your daily post attachment upload limit has been reached.");
        }
        if (drafts >= POST_MEDIA_MAX_DRAFTS) {
          throw fail(429, "Remove an unused attachment before uploading another.");
        }
        await tx.postMediaUploadAttempt.create({
          data: { ownerId: actor.accountId, inputSize: bytes.length, createdAt: now() },
        });
      });
      let output = bytes;
      let type = contentType;
      let pageCount = null;
      if (kind === "IMAGE") {
        const result = await processImage(bytes, contentType);
        output = result.bytes;
        type = "image/webp";
      } else if (kind === "DOCUMENT") {
        const result = await processPdf(bytes, contentType);
        output = result.bytes;
        const pdf = await PDFDocument.load(output, { ignoreEncryption: false, updateMetadata: false });
        pageCount = pdf.getPageCount();
        if (pageCount < 1 || pageCount > 100) throw fail(415, "Use a PDF containing 1 to 100 pages.");
      } else if (!videoSignature(bytes, contentType)) {
        throw fail(415, "Use a valid MP4 or WebM video.");
      }
      const key = `posts/${actor.accountId}/${randomUUID()}`;
      await storage.put(key, output, type);
      try {
        await assertNetworkSession(prisma, actor, now);
        return await prisma.postMedia.create({
          data: {
            ownerId: actor.accountId, storageKey: key, kind,
            name: sanitizeName(parsed.data.name, type),
            contentType: type, size: output.length, pageCount, createdAt: now(),
          },
          select: postMediaSelect,
        });
      } catch (error) {
        await storage.delete(key).catch(() => {});
        throw error;
      }
    },

    async bind(tx, accountId, ids, postId) {
      if (!ids?.length) return [];
      const selection = postMediaIds.safeParse(ids);
      if (!selection.success) throw fail(400, "Choose up to four unique attachments.");
      const records = await tx.postMedia.findMany({
        where: { id: { in: ids }, ownerId: accountId, postId: null, discardedAt: null,
          createdAt: { gte: new Date(+now() - 86400000) } },
        select: postMediaSelect,
      });
      if (records.length !== ids.length) {
        throw fail(400, "One or more attachments are unavailable or already published.");
      }
      requireKindSelection(records);
      const attached = await tx.postMedia.updateMany({
        where: { id: { in: ids }, ownerId: accountId, postId: null, discardedAt: null },
        data: { postId },
      });
      if (attached.count !== ids.length) throw fail(409, "Attachments have changed. Reload your draft.");
      return records;
    },

    async discard(actor, value) {
      const id = z.uuid().safeParse(value);
      if (!id.success) throw fail(400, "Choose a valid attachment.");
      await assertNetworkSession(prisma, actor, now);
      const record = await prisma.postMedia.findFirst({
        where: { id: id.data, ownerId: actor.accountId, postId: null, discardedAt: null },
      });
      if (!record) throw fail(404, "Attachment is no longer available.");
      await prisma.postMedia.updateMany({
        where: { id: record.id, ownerId: actor.accountId, postId: null, discardedAt: null },
        data: { discardedAt: now() },
      });
      try {
        await storage.delete(record.storageKey);
        await prisma.postMedia.deleteMany({ where: { id: record.id, postId: null, discardedAt: { not: null } } });
      } catch {
        // Keep a tombstone so cleanup can retry without restoring access.
      }
      return { discarded: true };
    },

    async file(actor, value, posts) {
      const id = z.uuid().safeParse(value);
      if (!id.success) throw fail(404, "Attachment is not available.");
      await assertNetworkSession(prisma, actor, now);
      const row = await prisma.postMedia.findFirst({
        where: { id: id.data, discardedAt: null },
        include: { post: { select: { id: true, authorId: true, withdrawnAt: true } } },
      });
      if (!row || (row.post && row.post.withdrawnAt)) throw fail(404, "Attachment is not available.");
      if (row.postId && row.ownerId !== actor.accountId) {
        // Reuse the public post's authorization, identity, and network-block
        // checks instead of leaking an object based on possession of its UUID.
        await posts.readPost(actor, "member", row.postId);
      } else if (row.ownerId !== actor.accountId) {
        throw fail(404, "Attachment is not available.");
      }
      await assertNetworkSession(prisma, actor, now);
      return {
        storageKey: row.storageKey, contentType: row.contentType,
        size: row.size, name: row.name, kind: row.kind,
      };
    },

    async read(actor, value, posts, rangeHeader = "") {
      const file = await this.file(actor, value, posts);
      let start = 0;
      let end = file.size - 1;
      let partial = false;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (!match || (!match[1] && !match[2])) throw fail(416, "Invalid media range.");
        if (!match[1]) {
          const suffix = Number(match[2]);
          if (!Number.isSafeInteger(suffix) || suffix <= 0) throw fail(416, "Invalid media range.");
          start = Math.max(0, file.size - suffix);
        } else start = Number(match[1]);
        if (match[2] && match[1]) end = Number(match[2]);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= file.size || end < start) {
          throw fail(416, "Invalid media range.");
        }
        end = Math.min(end, file.size - 1);
        partial = true;
      }
      const limit = 4 * 1024 * 1024;
      if (file.kind === "VIDEO" || rangeHeader) {
        end = Math.min(end, start + limit - 1);
        partial = true;
      }
      const bytes = partial
        ? await storage.getRange(file.storageKey, { start, end, maxBytes: limit })
        : await storage.get(file.storageKey, { maxBytes: POST_MEDIA_MAX_DOCUMENT_BYTES });
      await assertNetworkSession(prisma, actor, now);
      return { ...file, bytes, partial, start, end };
    },

    async cleanupDrafts({ limit = 100 } = {}) {
      storage.check();
      const since = new Date(+now() - 86400000);
      const records = await prisma.postMedia.findMany({
        where: { postId: null, OR: [{ discardedAt: { not: null } }, { createdAt: { lt: since } }] },
        orderBy: { createdAt: "asc" }, take: limit,
      });
      let deleted = 0;
      for (const record of records) {
        await prisma.postMedia.updateMany({
          where: { id: record.id, postId: null },
          data: { discardedAt: now() },
        });
        try {
          await storage.delete(record.storageKey);
          deleted += (await prisma.postMedia.deleteMany({
            where: { id: record.id, postId: null, discardedAt: { not: null } },
          })).count;
        } catch { /* Retry later; no public or owner access to the tombstone. */ }
      }
      await prisma.postMediaUploadAttempt.deleteMany({
        where: { createdAt: { lt: new Date(+now() - 3 * 86400000) } },
      });
      return { deleted };
    },
  };
}
