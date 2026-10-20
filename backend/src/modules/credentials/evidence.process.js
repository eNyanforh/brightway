import { Worker } from "node:worker_threads";
import { processPhoto } from "../photos/photo.image.js";
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export async function processEvidence(bytes, type) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > EVIDENCE_MAX_BYTES) {
    throw Object.assign(new Error("Choose a document up to 5 MiB."), { status: 413 });
  }
  if (type !== "application/pdf") {
    const result = await processPhoto(bytes, type);
    return { bytes: result.bytes, contentType: "image/webp" };
  }
  if (!bytes.subarray(0, 8).toString("ascii").match(/^%PDF-1\.[0-7]|^%PDF-2\.0/) || !bytes.subarray(-2048).includes(Buffer.from("%%EOF"))) {
    throw Object.assign(new Error("Choose a valid PDF."), { status: 415 });
  }
  const valid = await new Promise((resolve) => {
    const worker = new Worker(new URL("./evidence.pdf-worker.js", import.meta.url), {
      workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 4 },
    });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      worker.terminate().finally(() => resolve(value));
    };
    const timer = setTimeout(() => finish(false), 8000);
    worker.once("message", finish);
    worker.once("error", () => finish(false));
    worker.once("exit", () => finish(false));
  });
  if (!valid) throw Object.assign(new Error("Use a readable PDF of up to 100 pages without encryption, forms, embedded files or scripts."), { status: 415 });
  return { bytes, contentType: "application/pdf" };
}
