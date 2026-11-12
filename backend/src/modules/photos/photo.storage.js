import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export function createR2Storage({
  config = process.env,
  client,
} = {}) {
  let s3 = client;

  const jurisdiction =
    config.R2_JURISDICTION || "default";

  function ready() {
    const allowedJurisdictions = [
      "default",
      "eu",
      "us",
      "fedramp",
    ];

    const invalidCredentials =
      !s3 &&
      (
        !/^[a-f0-9]{32}$/i.test(
          config.R2_ACCOUNT_ID ?? ""
        ) ||
        !config.R2_ACCESS_KEY_ID ||
        !config.R2_SECRET_ACCESS_KEY
      );

    if (
      !allowedJurisdictions.includes(jurisdiction) ||
      !config.R2_BUCKET ||
      invalidCredentials
    ) {
      throw Object.assign(
        new Error("Photo storage is not configured."),
        { status: 503 }
      );
    }

    if (!s3) {
      const jurisdictionPrefix =
        jurisdiction === "default"
          ? ""
          : `${jurisdiction}.`;

      s3 = new S3Client({
        region: "auto",

        endpoint:
          `https://${config.R2_ACCOUNT_ID}.` +
          `${jurisdictionPrefix}r2.cloudflarestorage.com`,

        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID,
          secretAccessKey: config.R2_SECRET_ACCESS_KEY,
        },

        maxAttempts: 2,
      });
    }
  }

  async function send(Command, input) {
    ready();

    try {
      return await s3.send(
        new Command({
          Bucket: config.R2_BUCKET,
          ...input,
        }),
        {
          abortSignal: AbortSignal.timeout(30000),
        }
      );
    } catch (failure) {
      // Log diagnostic fields only, never credentials,
      // request bodies, or the complete SDK error.
      console.error("[R2 diagnostic]", {
        operation: Command.name,
        name: failure?.name,
        code: failure?.code,
        httpStatus:
          failure?.$metadata?.httpStatusCode,
        causeCode: failure?.cause?.code,
      });

      throw Object.assign(
        new Error(
          "Photo storage is temporarily unavailable."
        ),
        { status: 503 }
      );
    }
  }

  return {
    check: ready,

    put(key, bytes, contentType = "image/webp") {
      return send(PutObjectCommand, {
        Key: key,
        Body: bytes,
        ContentType: contentType,
      });
    },

    delete(key) {
      return send(DeleteObjectCommand, {
        Key: key,
      });
    },

    // Bounded byte-range reads allow private MP4/WebM playback without
    // buffering the whole video or exposing R2 objects through public URLs.
    async getRange(key, { start, end, maxBytes = 4 * 1024 * 1024 } = {}) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start < 0 || end < start || end - start + 1 > maxBytes ||
          maxBytes < 1 || maxBytes > 5 * 1024 * 1024) {
        throw Object.assign(new Error("Invalid media byte range."), { status: 416 });
      }
      const result = await send(GetObjectCommand, { Key: key, Range: `bytes=${start}-${end}` });
      if (!result.Body || (result.ContentLength ?? 0) > maxBytes) {
        throw Object.assign(new Error("Media cannot be read."), { status: 503 });
      }
      const bytes = Buffer.from(await result.Body.transformToByteArray());
      if (bytes.length !== end - start + 1) {
        throw Object.assign(new Error("Incomplete media range."), { status: 503 });
      }
      return bytes;
    },

    async get(key, { maxBytes = 2 * 1024 * 1024 } = {}) {
      const result = await send(GetObjectCommand, {
        Key: key,
      });

      if (maxBytes > 5 * 1024 * 1024 || maxBytes <= 0) throw new Error("Invalid storage read limit.");

      if (
        !result.Body ||
        result.ContentLength > maxBytes
      ) {
        throw Object.assign(
          new Error("Photo could not be read."),
          { status: 503 }
        );
      }

      try {
        const bytes = Buffer.from(
          await result.Body.transformToByteArray()
        );

        if (bytes.length > maxBytes) {
          throw new Error("Invalid photo size.");
        }

        return bytes;
      } catch {
        throw Object.assign(
          new Error("Photo could not be read."),
          { status: 503 }
        );
      }
    },
  };
}