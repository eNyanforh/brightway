// Private, memory-only JSON request sharing. Never an authorization source.
const realms = new Map();
const state = realm => {
  if (!realms.has(realm)) realms.set(realm, { identity: null, entries: new Map(), organizationScopes: new Map(), epoch: 0 });
  return realms.get(realm);
};
export function setReadIdentity(realm, identity) {
  const store = state(realm);
  if (store.identity === identity) return;
  invalidateReads(realm); store.identity = identity;
}
export function invalidateReads(realm = "personal", except = null) {
  const store = state(realm); store.epoch++;
  for (const entry of store.entries.values()) if (entry !== except) entry.controller.abort();
  store.entries.clear(); store.organizationScopes.clear();
}
export function expireReadSnapshots() {
  // Focus revalidates snapshots, while sharing work already in flight.
  for (const store of realms.values()) for (const [key, entry] of store.entries) {
    if (entry.done) store.entries.delete(key);
  }
}
export function scopeOrganizationReads(context) {
  const store = state("personal"), organizationId = context?.organization?.id;
  if (!store.identity || context.accountId !== store.identity || typeof organizationId !== "string" || !Number.isInteger(context.staffVersion) || !Array.isArray(context.permissions)) return;
  const previous = store.organizationScopes.get(organizationId);
  if (previous && previous.version > context.staffVersion) return;
  store.organizationScopes.set(organizationId, { version: context.staffVersion, key: JSON.stringify([context.staffVersion, context.membership?.version, context.membership?.role, context.setup?.version, [...context.permissions].sort()]) });
}
export function resourceFetch(url, options = {}, realm = "personal") {
  const store = state(realm), method = options.method || "GET";
  if (method !== "GET") {
    invalidateReads(realm);
    return Promise.resolve(fetch(url, options)).finally(() => invalidateReads(realm));
  }
  // Authentication, evidence and images are deliberately not cached here.
  if (!store.identity || /\/(?:auth|documents|evidence|images|portrait|photo)(?:\/|\?|$)/.test(url)) return fetch(url, options);
  const organization = url.match(/\/organization-workspace\/([^/?]+)(\/[^?]*)?(?:\?|$)/);
  const scope = organization && store.organizationScopes.get(decodeURIComponent(organization[1]));
  const key = `${url}:${JSON.stringify(options.headers || {})}:${scope?.key || "unscoped"}`;
  // Access context is always fresh. A recent tenant snapshot is reusable only
  // under a server-returned current membership/permission scope.
  const privateAccess = /\/(?:admin|management)(?:\/|\?|$)/.test(url) || Boolean(organization && (!organization[2] || !scope));
  const ttl = privateAccess ? 0 : 10000;
  let entry = store.entries.get(key);
  if (entry?.done && Date.now() - entry.at >= ttl) { store.entries.delete(key); entry = null; }
  if (!entry) {
    const controller = new AbortController(), epoch = store.epoch;
    entry = { controller, consumers: 0, done: false, at: 0 };
    const current = entry;
    current.promise = Promise.resolve(fetch(url, { ...options, signal: controller.signal })).then(response => {
      if ([401, 403].includes(response.status)) { current.done = true; invalidateReads(realm, current); return response; }
      if (!response.ok || epoch !== store.epoch) { if (store.entries.get(key) === current) store.entries.delete(key); }
      else { current.done = true; current.at = Date.now(); }
      return response;
    }).catch(error => { if (store.entries.get(key) === current) store.entries.delete(key); throw error; });
    store.entries.set(key, current);
  }
  const current = entry, signal = options.signal;
  current.consumers++;
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(work) {
      if (settled) return;
      settled = true; signal?.removeEventListener("abort", abort); current.consumers--;
      if (!current.done && !current.consumers) {
        if (store.entries.get(key) === current) store.entries.delete(key);
        current.controller.abort();
      }
      work();
    }
    function abort() { finish(() => reject(new DOMException("Aborted", "AbortError"))); }
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    current.promise.then(response => finish(() => { try { resolve(response.clone()); } catch (error) { reject(error); } }), error => finish(() => reject(error)));
  });
}
