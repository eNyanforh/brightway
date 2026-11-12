import { createR2Storage } from "../photos/photo.storage.js";

export function createPostMediaStorage({ config = process.env, client } = {}) {
  const bucket = config.R2_POST_BUCKET?.trim();
  const privateBuckets = [config.R2_BUCKET, config.R2_MESSAGE_BUCKET,
    config.R2_IDENTITY_BUCKET, config.R2_APPLICATION_BUCKET].map(value => value?.trim());
  const storage = createR2Storage({ config: { ...config, R2_BUCKET: bucket }, client });
  const check = () => {
    if (!bucket || privateBuckets.includes(bucket)) {
      throw Object.assign(new Error("Post media storage requires a separate R2_POST_BUCKET."), { status: 503 });
    }
    storage.check();
  };
  return {
    check,
    put(...args) { check(); return storage.put(...args); },
    get(...args) { check(); return storage.get(...args); },
    delete(...args) { check(); return storage.delete(...args); },
  };
}
