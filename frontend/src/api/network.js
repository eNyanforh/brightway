import { ApiError } from "./auth";
import { resourceFetch } from "./read-cache";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, { body, signal } = {}) {
  let response;
  try { response = await resourceFetch(base + path, { method: body ? "POST" : "GET", credentials: "include", cache: "no-store", signal, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }); }
  catch (error) { if (error.name === "AbortError") throw error; throw new ApiError("Unable to reach BrightWay. Reload saved network state before retrying."); }
  let payload;
  try { payload = await response.json(); } catch { throw new ApiError("Unexpected network response. Reload before continuing.", response.status); }
  if (!response.ok || payload.success !== true) throw new ApiError(payload.message || "Network request failed.", response.status);
  return payload.data;
}
const person = username => `/network/people/${encodeURIComponent(username)}`;
export const networkApi = {
  list: async (view, cursor, signal) => {
    const query = new URLSearchParams({ view }); if (cursor) query.set("cursor", cursor);
    const data = await request(`/network?${query}`, { signal });
    if (!Array.isArray(data?.items)) throw new ApiError("Unable to read your network. Please reload.");
    return data;
  },
  person: (username, signal) => request(person(username), { signal }),
  action: (username, body) => request(person(username) + "/actions", { body }),
  followTarget: (kind, username, signal) => request(`/network/follows/${kind === "ORGANIZATION" ? "organizations" : "people"}/${encodeURIComponent(username)}`, { signal }),
  followAction: (kind, username, body) => request(`/network/follows/${kind === "ORGANIZATION" ? "organizations" : "people"}/${encodeURIComponent(username)}/actions`, { body }),
  contact: (username, signal) => request(person(username) + "/contact", { signal }),
};
