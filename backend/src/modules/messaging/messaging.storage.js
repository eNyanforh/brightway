import { createR2Storage } from "../photos/photo.storage.js";
export function createMessageStorage({ config = process.env, client } = {}) {
  const bucket = config.R2_MESSAGE_BUCKET?.trim();
  const storage = createR2Storage({ config: { ...config, R2_BUCKET: bucket }, client });
  const check = () => {
    if (!bucket || [config.R2_BUCKET, config.R2_IDENTITY_BUCKET, config.R2_APPLICATION_BUCKET].map(v => v?.trim()).includes(bucket)) throw Object.assign(Error("Private message storage is not configured."), { status: 503 });
    storage.check();
  };
  return { check, put(...args) { check(); return storage.put(...args); }, get(...args) { check(); return storage.get(...args); }, delete(...args) { check(); return storage.delete(...args); } };
}
