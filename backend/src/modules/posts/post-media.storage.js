import { createR2Storage } from "../photos/photo.storage.js";

// Keep attachments in a distinct private bucket, never a public CDN. Image,
// PDF and video requests are served through the authenticated BrightWay API.
export function createPostMediaStorage({ config = process.env, client } = {}) {
  const bucket = config.R2_POST_BUCKET?.trim();
  const storage = createR2Storage({ config: { ...config, R2_BUCKET: bucket }, client });
  const check = () => {
    const otherBuckets = [
      config.R2_BUCKET, config.R2_MESSAGE_BUCKET,
      config.R2_IDENTITY_BUCKET, config.R2_APPLICATION_BUCKET,
    ].map(value => value?.trim());
    if (!bucket || otherBuckets.includes(bucket)) {
      throw Object.assign(new Error("Private post media storage is not configured."), { status: 503 });
    }
    storage.check();
  };
  return {
    check,
    put(...args) { check(); return storage.put(...args); },
    get(...args) { check(); return storage.get(...args); },
    getRange(...args) { check(); return storage.getRange(...args); },
    delete(...args) { check(); return storage.delete(...args); },
  };
}
