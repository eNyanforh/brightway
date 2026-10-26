import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
const owner = "/manual-identity/name-changes", admin = "/admin/name-changes";
async function request(path, method = "GET", body, signal) {
  let response;
  try { response = await fetch(base + path, { method, signal, credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("Unable to reach BrightWay. Keep this page open and retry or reload your request."); }
  let payload; try { payload = await response.json(); } catch { throw new ApiError("Unexpected name-correction response. Reload before continuing.", response.status); }
  if (!response.ok || payload.success !== true) throw new ApiError(payload.message || "Name correction is unavailable.", response.status);
  return payload.data;
}
export const nameChangesApi = {
  owner: signal => request(owner, "GET", undefined, signal),
  submit: body => request(owner, "POST", body),
  cancel: (id, expectedVersion) => request(`${owner}/${encodeURIComponent(id)}`, "DELETE", { expectedVersion }),
  queue: (cursor, signal) => request(admin + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), "GET", undefined, signal),
  detail: (id, signal) => request(`${admin}/${encodeURIComponent(id)}`, "GET", undefined, signal),
  assign: (id, expectedVersion) => request(`${admin}/${encodeURIComponent(id)}/assign`, "POST", { expectedVersion }),
  decide: (id, body) => request(`${admin}/${encodeURIComponent(id)}/decision`, "POST", body),
  portrait: (id, signal) => nameChangesApi.image(id, null, signal),
  async image(id, imageId, signal) {
    let response;
    try { response = await fetch(base + (imageId ? `${owner}/${encodeURIComponent(id)}/evidence/${encodeURIComponent(imageId)}` : `${admin}/${encodeURIComponent(id)}/portrait`), { signal, credentials: "include", cache: "no-store" }); }
    catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("Unable to load private evidence."); }
    if (!response.ok) { let payload; try { payload = await response.json(); } catch { /* Generic error. */ } throw new ApiError(payload?.message || "Private evidence is unavailable.", response.status); }
    return response.blob();
  },
};
