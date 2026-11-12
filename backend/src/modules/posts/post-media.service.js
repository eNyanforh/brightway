import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { assertNetworkSession } from "../network/network-authority.js";
import { fail } from "../network/network.schema.js";
import { processEvidence } from "../credentials/evidence.process.js";
import { createManualIdentityReviewService } from "../manual-identity/manual-identity-review.service.js";

const MAX_BYTES = 20 * 1024 * 1024;
const FIVE_MIB = 5 * 1024 * 1024;
const types = {
  "image/jpeg": "IMAGE", "image/png": "IMAGE", "image/webp": "IMAGE",
  "video/mp4": "VIDEO", "video/webm": "VIDEO", "application/pdf": "PDF",
};
const idSchema = z.uuid();
const cleanName = (raw, ext) => raw.replace(/[\\/\x00-\x1f\x7f"<>]/g, "_").replace(/\.[^.]+$/, "").slice(0, 110).trim() + "." + ext;
const photoExt = "webp";
const videoMatches = (bytes, type) => type === "video/mp4"
  ? bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp"
  : bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    && bytes.subarray(4, 4096).includes(Buffer.from("webm"));

export const publicMedia = ({ id, kind, name, contentType, size, pages }) => ({ id, kind, name, contentType, size, pages });

export function createPostMediaService({ prisma, storage, posts, now = () => new Date(), processFile = processEvidence }) {
  const identity = createManualIdentityReviewService({ prisma, now });
  const authorize = async actor => {
    await assertNetworkSession(prisma, actor, now);
    if ((await identity.inspectAccount(prisma, actor.accountId)).status !== "APPROVED") {
      throw fail(403, "Verify your identity before uploading post media.");
    }
  };
  return {
    async upload(actor, rawName, bytes, mime) {
      const parsed = z.string().trim().min(1).max(120).safeParse(rawName);
      if (!parsed.success) throw fail(400, "Choose a file with a valid name.");
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES)
        throw fail(413, "Choose an image or PDF up to 5 MiB or a video up to 20 MiB.");
      const kind = types[mime];
      if (!kind) throw fail(415, "Only JPEG, PNG, WebP, MP4, WebM and PDF files are supported.");
      if (kind !== "VIDEO" && bytes.length > FIVE_MIB)
        throw fail(413, "Images and PDFs must not exceed 5 MiB.");
      await authorize(actor);
      storage.check();
      const recent = await prisma.postMedia.aggregate({
        where: { ownerId: actor.accountId, createdAt: { gte: new Date(+now() - 86400000) } },
        _count: true, _sum: { size: true },
      });
      if (recent._count >= 30 || (recent._sum.size || 0) + bytes.length > 80 * 1024 * 1024)
        throw fail(429, "Your daily post media allowance has been reached.");
      let processed;
      if (kind === "VIDEO") {
        if (!videoMatches(bytes, mime)) throw fail(415, "The selected file is not a supported MP4 or WebM video.");
        processed = { bytes, contentType: mime };
      } else processed = await processFile(bytes, mime);
      const pages = kind === "PDF" ? (await PDFDocument.load(processed.bytes)).getPageCount() : null;
      const ext = kind === "IMAGE" ? photoExt : kind === "PDF" ? "pdf" : mime === "video/mp4" ? "mp4" : "webm";
      const key = "post-media/" + randomUUID();
      await storage.put(key, processed.bytes, processed.contentType);
      try {
        const saved = await prisma.postMedia.create({
          data: { ownerId: actor.accountId, kind, name: cleanName(parsed.data, ext),
            contentType: processed.contentType, storageKey: key, size: processed.bytes.length, pages, createdAt: now() },
        });
        return { media: publicMedia(saved) };
      } catch (error) {
        await storage.delete(key).catch(() => {});
        throw error;
      }
    },
    async discard(actor, rawId) {
      const id = idSchema.parse(rawId);
      await assertNetworkSession(prisma, actor, now);
      const file = await prisma.postMedia.findFirst({ where: { id, ownerId: actor.accountId, memberPostId: null } });
      if (!file) throw fail(404, "This draft media is no longer available.");
      // Remove access before attempting object cleanup. A cleanup job can sweep
      // orphaned storage objects if the object store is temporarily unreachable.
      await prisma.postMedia.delete({ where: { id } });
      await storage.delete(file.storageKey).catch(() => {});
      return { discarded: true };
    },
    async file(actor, rawId) {
      const id = idSchema.parse(rawId);
      await assertNetworkSession(prisma, actor, now);
      const file = await prisma.postMedia.findUnique({ where: { id } });
      if (!file) throw fail(404, "This media is unavailable.");
      if (file.memberPostId) {
        await posts.readPost(actor, "member", file.memberPostId);
      } else if (file.ownerId !== actor.accountId || +now() - +file.createdAt > 86400000) {
        throw fail(404, "This media is unavailable.");
      }
      const bytes = await storage.get(file.storageKey, { maxBytes: MAX_BYTES });
      await assertNetworkSession(prisma, actor, now);
      return { bytes, name: file.name, contentType: file.contentType, kind: file.kind };
    },
    async cleanupDrafts() {
      const cutoff = new Date(+now() - 86400000);
      const rows = await prisma.postMedia.findMany({
        where: { memberPostId: null, createdAt: { lt: cutoff } },
        select: { id: true, storageKey: true }, take: 100, orderBy: { createdAt: "asc" },
      });
      for (const row of rows) {
        await prisma.postMedia.deleteMany({ where: { id: row.id, memberPostId: null } });
        await storage.delete(row.storageKey).catch(() => {});
      }
      return { cleaned: rows.length };
    },
  };
}
