import sharp from "sharp";
export const IDENTITY_MAX_BYTES = 5 * 1024 * 1024;
export const IDENTITY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const formats = new Map([["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"]]);
let active = 0;
export async function processIdentityImage(bytes, type) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > IDENTITY_MAX_BYTES) {
    throw Object.assign(new Error("Choose an identity image up to 5 MiB."), { status: 413 });
  }
  if (active >= 2) throw Object.assign(new Error("Identity image processing is busy. Please retry."), { status: 503 });
  active++;
  try {
    const image = sharp(bytes, { limitInputPixels: 20000000, failOn: "warning", animated: true });
    const metadata = await image.metadata();
    if (metadata.format !== formats.get(type) || !formats.has(type) || (metadata.pages ?? 1) !== 1 ||
        metadata.width < 320 || metadata.height < 240) throw Error("Invalid image");
    const { data, info } = await image.rotate()
      .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 92 }).toBuffer({ resolveWithObject: true });
    if (data.length > IDENTITY_MAX_BYTES) throw Error("Output exceeds limit");
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    throw Object.assign(new Error("Choose a still JPEG, PNG or WebP image, at least 320 × 240 pixels."), { status: 415 });
  } finally { active--; }
}
