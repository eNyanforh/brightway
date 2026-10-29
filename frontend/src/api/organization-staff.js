import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, method = "GET", body, signal) {
  let response;
  try { response = await fetch(base + path, { method, signal, credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch (error) { if (error.name === "AbortError") throw error; throw new ApiError("Unable to reach BrightWay. Keep your changes and retry."); }
  let result; try { result = await response.json(); } catch { throw new ApiError("Unexpected staffing response. Reload before continuing.", response.status); }
  if (!response.ok || result.success !== true) throw new ApiError(result.message || "Organization staffing is unavailable.", response.status);
  return result.data;
}
const query = paging => { const value = new URLSearchParams(paging || {}).toString(); return value ? `?${value}` : ""; };
export const staffApi = {
  directory: (signal, filters) => request("/my-workspace" + query(filters), "GET", undefined, signal),
  home: (signal, paging) => request("/organization-workspace" + query(paging), "GET", undefined, signal),
  context: (id, signal) => request(`/organization-workspace/${encodeURIComponent(id)}`, "GET", undefined, signal),
  staff: (id, signal, paging) => request(`/organization-workspace/${encodeURIComponent(id)}/staff${query(paging)}`, "GET", undefined, signal),
  invite: (id, body) => request(`/organization-workspace/${encodeURIComponent(id)}/invitations`, "POST", body),
  respond: (id, body) => request(`/organization-invitations/${encodeURIComponent(id)}/respond`, "POST", body),
  cancel: (orgId, id, body) => request(`/organization-workspace/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(id)}/cancel`, "POST", body),
  change: (orgId, id, body) => request(`/organization-workspace/${encodeURIComponent(orgId)}/members/${encodeURIComponent(id)}`, "PATCH", body),
};
