import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
const query = values => { const p = new URLSearchParams(Object.entries(values || {}).filter(([, v]) => v)); return p.size ? "?" + p : ""; };
async function request(path, { method = "GET", body, signal, file } = {}) {
  let response;
  try { response = await fetch(base + path, { method, credentials: "include", cache: "no-store", signal, ...(file ? { headers: { "Content-Type": file.type }, body: file } : body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("Unable to reach BrightWay. Your draft is kept. Retry when connected."); }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new ApiError(result?.message || "Messaging is temporarily unavailable.", response.status);
  return result.data;
}
export function messagingApi(management = false) {
  const root = management ? "/management/official-messages" : "/messaging/conversations";
  return {
    list: (params, signal) => request(root + query(params), { signal }),
    detail: (id, cursor, signal, organizationId) => request(`${root}/${encodeURIComponent(id)}${query({ cursor, organizationId })}`, { signal }),
    recipients: (kind, q) => request(`${root}/recipients${query({ kind, q })}`),
    resolveShare: path => request("/messaging/shared-content" + query({ path })),
    open: username => request(root, { method: "POST", body: { username } }),
    send: (id, body) => request(`${root}/${encodeURIComponent(id)}/messages`, { method: "POST", body }),
    official: body => request(root, { method: "POST", body }),
    receipt: (id, state, throughId) => request(`${root}/${encodeURIComponent(id)}/receipts`, { method: "POST", body: { state, throughId } }),
    preferences: () => request("/messaging/preferences"),
    setPreferences: body => request("/messaging/preferences", { method: "PUT", body }),
    heartbeat: () => request("/messaging/heartbeat", { method: "POST", body: {} }),
    typing: (id, active) => request(`${root}/${encodeURIComponent(id)}/typing`, { method: "POST", body: { active } }),
    upload: (id, file) => request(`${root}/${encodeURIComponent(id)}/files${query({ name: file.name })}`, { method: "POST", file }),
    discardFile: (id, fileId) => request(`${root}/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }),
    fileUrl: (id, fileId) => `${base}${root}/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
    events: params => `${base}${management ? root : "/messaging"}/events${query(params)}`,
  };
}
export function subscribeMessaging(params, callback, management = false) {
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource(messagingApi(management).events(params), { withCredentials: true });
  const names = ["sync", "message:new", "message:delivered", "message:read", "conversation:read", "typing:start", "typing:stop", "presence:update", "notification:new", "notification:read", "access:changed"];
  for (const name of names) source.addEventListener(name, event => {
    callback(name, JSON.parse(event.data || "{}"));
    if (name === "access:changed") source.close();
  });
  source.onerror = () => callback("connection:reconnecting", {});
  source.onopen = () => callback("connection:open", {});
  return () => source.close();
}
