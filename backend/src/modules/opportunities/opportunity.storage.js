import { createR2Storage } from "../photos/photo.storage.js";

export function createApplicationStorage({ config = process.env, client } = {}) {
  const bucket = config.R2_APPLICATION_BUCKET?.trim();
  const storage = createR2Storage({ config: { ...config, R2_BUCKET: bucket }, client });
  function check() {
    if (!bucket || [config.R2_BUCKET?.trim(), config.R2_IDENTITY_BUCKET?.trim()].includes(bucket))
      throw Object.assign(Error("Application files are temporarily unavailable. Try again later."), { status: 503 });
    try { storage.check(); }
    catch { throw Object.assign(Error("Application files are temporarily unavailable. Try again later."), { status: 503 }); }
  }
  return { check, put(...args) { check(); return storage.put(...args); },
    get(...args) { check(); return storage.get(...args); }, delete(...args) { check(); return storage.delete(...args); } };
}
