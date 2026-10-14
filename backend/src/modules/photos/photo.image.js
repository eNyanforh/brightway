import sharp from "sharp";

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const formats = new Map([["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"]]);
let active = 0;
export async function processPhoto(bytes, type) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > PHOTO_MAX_BYTES) {
    throw Object.assign(new Error("Choose a photo up to 5 MiB."), { status: 413 });
  }
  if (active >= 2) throw Object.assign(new Error("Photo processing is busy. Please retry."), { status: 503 });
  active++;
  try {
    const image = sharp(bytes, { limitInputPixels: 20000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!formats.has(type) || metadata.format !== formats.get(type) || (metadata.pages ?? 1) !== 1 ||
      metadata.width < 128 || metadata.height < 128) {
      throw new Error("invalid image");
    }
    const { data, info } = await image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (data.length > 2 * 1024 * 1024) throw new Error("large output");
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    throw Object.assign(new Error("Choose a valid, still JPEG, PNG or WebP photo, at least 128 × 128 pixels."), { status: 415 });
  } finally { active--; }
}