import { resourceFetch } from "./read-cache";
import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
function query(values = {}) { const params = new URLSearchParams(Object.entries(values).filter(([,v]) => v !== undefined && v !== null && v !== "")); return params.size ? `?${params}` : ""; }
async function request(path, { body, signal, personal = false } = {}) {
  let response;
  try { response = await resourceFetch(base + path, { method: body ? "POST" : "GET", credentials: "include", cache: "no-store", signal, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }, personal ? "personal" : "management"); }
  catch (error) { if (error.name === "AbortError") throw error; throw new ApiError("Unable to reach BrightWay. Reload the saved state before retrying an action."); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) throw new ApiError(payload?.message || "The management request could not be completed.", response.status);
  return payload.data;
}
const root = "/management/tools";
export const managementToolsApi = {
  directory: (kind, params, signal) => request(`${root}/${kind}${query(params)}`, { signal }),
  entity: (kind, id, signal) => request(`${root}/${kind}/${encodeURIComponent(id)}`, { signal }),
  control: (kind, id, body) => request(`${root}/${kind}/${encodeURIComponent(id)}/actions`, { body }),
  audit: (params, signal) => request(`${root}/audit${query(params)}`, { signal }),
  operations: signal => request(`${root}/operations`, { signal }),
  postReviews: signal => request(`${root}/post-reviews`, { signal }),
  reviewPost: (id, body) => request(`${root}/post-reviews/${encodeURIComponent(id)}/decision`, { body }),
  cases(personal = false) {
    const prefix = personal ? "/support/cases" : `${root}/cases`;
    return {
      list: (params, signal) => request(`${prefix}${query(params)}`, { signal, personal }),
      detail: (id, messageCursor, signal) => request(`${prefix}/${encodeURIComponent(id)}${query({ messageCursor })}`, { signal, personal }),
      create: body => request(prefix, { body, personal }),
      action: (id, body) => request(`${prefix}/${encodeURIComponent(id)}/actions`, { body, personal }),
      message: (id, body) => request(`${prefix}/${encodeURIComponent(id)}/messages`, { body, personal }),
    };
  },
};
