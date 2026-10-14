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

    put(key, bytes) {
      return send(PutObjectCommand, {
        Key: key,
        Body: bytes,
        ContentType: "image/webp",
      });
    },

    delete(key) {
      return send(DeleteObjectCommand, {
        Key: key,
      });
    },

    async get(key) {
      const result = await send(GetObjectCommand, {
        Key: key,
      });

      const maxBytes = 2 * 1024 * 1024;

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