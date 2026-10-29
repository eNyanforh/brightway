import { organizationPictureUrl } from "./organization-profile";
import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, method = "GET", body, signal) {
  let response;
  try { response = await fetch(base + path, { method, signal, credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("Unable to reach BrightWay. Keep this page open and retry or reload."); }
  let payload; try { payload = await response.json(); } catch { throw new ApiError("Unexpected organization response. Reload before continuing.", response.status); }
  if (!response.ok || payload.success !== true) throw new ApiError(payload.message || "Organization requests are unavailable.", response.status);
  return payload.data;
}
const admin = "/admin/organizations", owner = "/organization-requests";
export const organizationsApi = {
  workAccess: signal => request("/work/access", "GET", undefined, signal),
  owner: (id, signal) => request(`${owner}/${encodeURIComponent(id)}`, "GET", undefined, signal),
  edit: (id, body) => request(`${owner}/${encodeURIComponent(id)}`, "PATCH", body),
  abort: (id, body) => request(`${owner}/${encodeURIComponent(id)}/abort`, "POST", body),
  access: signal => request("/organization-operations/access", "GET", undefined, signal),
  list: (signal, cursor) => request(owner + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), "GET", undefined, signal),
  submit: body => request(owner, "POST", body),
  queue: (signal, cursor) => request(admin + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), "GET", undefined, signal),
  detail: (id, signal) => request(`${admin}/${encodeURIComponent(id)}`, "GET", undefined, signal),
  assign: (id, body) => request(`${admin}/${encodeURIComponent(id)}/assign`, "POST", body),
  report: (id, body) => request(`${admin}/${encodeURIComponent(id)}/findings`, "POST", body),
  decide: (id, body) => request(`${admin}/${encodeURIComponent(id)}/decision`, "POST", body),
  publicOrganization: async (id, signal) => { const data = await request(`/organizations/${encodeURIComponent(id)}`, "GET", undefined, signal); return data.photo ? { ...data, photo: { id: data.photo.id, url: organizationPictureUrl(id, data.photo.id) } } : data; },
};
