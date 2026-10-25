import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// This probe owns one generated key. It never lists a bucket or reads database rows.
export async function checkIdentityStorage({ storage, head, makeImage, id = randomUUID() }) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error("Invalid synthetic storage-check ID.");
  const key = `_brightway_checks/manual-identity/${id}.webp`;
  let stage = "configuration", attempted = false, deleted = false, failure = null;
  try {
    storage.check();
    stage = "checking the temporary key";
    if (await head(key)) throw Error("Temporary key already exists; no write was attempted.");
    stage = "generating the synthetic image";
    const bytes = await makeImage();
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 1024 * 1024) throw Error("Invalid synthetic image.");
    stage = "writing the synthetic image"; attempted = true;
    await storage.put(key, bytes, "image/webp");
    stage = "checking the stored image";
    if (!await head(key)) throw Error("Stored synthetic image not found.");
    stage = "reading the synthetic image";
    const read = await storage.get(key, { maxBytes: 1024 * 1024 });
    if (!Buffer.isBuffer(read) || !bytes.equals(read)) throw Error("Stored bytes did not match.");
    stage = "deleting the synthetic image";
    await storage.delete(key);
    stage = "confirming deletion";
    if (await head(key)) throw Error("Synthetic object remains after deletion.");
    deleted = true;
  } catch {
    failure = Error(`Identity storage check failed while ${stage}.`);
  } finally {
    if (attempted && !deleted) {
      try { await storage.delete(key); deleted = !await head(key); }
      catch { deleted = false; }
      if (!deleted) {
        failure ??= Error("Identity storage check cleanup failed.");
        failure.syntheticObjectKey = key;
      }
    }
  }
  if (failure) throw failure;
  return { written: true, exactReadback: true, deletionConfirmed: true };
}

async function main() {
  if (process.argv.slice(2).length) throw Error("Usage: node backend/scripts/check-identity-storage.js");
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  const config = process.env;
  const jurisdiction = config.R2_JURISDICTION || "default";
  if (!/^[a-f0-9]{32}$/i.test(config.R2_ACCOUNT_ID ?? "") || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY ||
      !["default", "eu", "us", "fedramp"].includes(jurisdiction)) throw Error("Check the existing private identity R2 configuration in backend/.env.");
  const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const { createManualIdentityStorage } = await import("../src/modules/manual-identity/manual-identity.storage.js");
  const { default: sharp } = await import("sharp");
  const client = new S3Client({ region: "auto", maxAttempts: 2,
    endpoint: `https://${config.R2_ACCOUNT_ID}.${jurisdiction === "default" ? "" : `${jurisdiction}.`}r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY } });
  const storage = createManualIdentityStorage({ config, client });
  storage.check();
  console.log("Checking one generated temporary image in the configured identity bucket. No database or user documents are accessed.");
  try {
    const result = await checkIdentityStorage({ storage,
      makeImage: () => sharp({ create: { width: 640, height: 480, channels: 3, background: "#eaf2ff" } }).webp().toBuffer(),
      async head(key) {
        try { await client.send(new HeadObjectCommand({ Bucket: config.R2_IDENTITY_BUCKET.trim(), Key: key }), { abortSignal: AbortSignal.timeout(30000) }); return true; }
        catch (error) { if (error?.$metadata?.httpStatusCode === 404) return false; throw Error("Unable to confirm synthetic-object existence."); }
      },
    });
    console.log("PASS: synthetic image written, exact bytes read back, and deletion confirmed by authenticated object lookup.");
    console.log(JSON.stringify(result));
  } finally { client.destroy(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); }
  catch (error) {
    console.error(error.message);
    if (error.syntheticObjectKey) console.error(`Synthetic test object deletion could not be confirmed: ${error.syntheticObjectKey}`);
    process.exitCode = 1;
  }
}
