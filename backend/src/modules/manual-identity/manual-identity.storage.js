import { createR2Storage } from "../photos/photo.storage.js";

// Never fall back to the profile-photo bucket for government identity documents.
export function createManualIdentityStorage({ config = process.env, client } = {}) {
  const bucket = config.R2_IDENTITY_BUCKET?.trim();
  const storage = createR2Storage({ config: { ...config, R2_BUCKET: bucket }, client });
  function check() {
    if (!bucket || bucket === config.R2_BUCKET?.trim()) {
      throw Object.assign(new Error("Configure a separate private identity storage bucket."), { status: 503 });
    }
    storage.check();
  }
  return {
    check,
    put(...args) { check(); return storage.put(...args); },
    get(...args) { check(); return storage.get(...args); },
    delete(...args) { check(); return storage.delete(...args); },
  };
}
