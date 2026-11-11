import { resourceFetch } from "./read-cache";
import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
const path = id => "/organization-workspace/" + encodeURIComponent(id) + "/campus";
async function request(pathname, method = "GET", body, signal) {
  let response;
  try {
    response = await resourceFetch(base + pathname, { method, signal, credentials: "include", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Cannot reach Virtual Campus. Keep your changes and retry.");
  }
  let result;
  try { result = await response.json(); } catch { throw new ApiError("Unexpected Campus response. Reload the page.", response.status); }
  if (!response.ok || result.success !== true) throw new ApiError(result.message || "Virtual Campus is unavailable.", response.status);
  return result.data;
}
export const campusApi = {
  read: (id, signal) => request(path(id), "GET", undefined, signal),
  setup: (id, body) => request(path(id) + "/setup", "PUT", body),
  activate: (id, expectedVersion) => request(path(id) + "/activate", "POST", { expectedVersion }),
  pause: (id, expectedVersion) => request(path(id) + "/pause", "POST", { expectedVersion }),
  resume: (id, expectedVersion) => request(path(id) + "/resume", "POST", { expectedVersion }),
  settings: (id, body) => request(path(id) + "/settings", "PATCH", body),
  announcements: (id, signal, cursor) => request(path(id) + "/announcements" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), "GET", undefined, signal),
  publish: (id, body) => request(path(id) + "/announcements", "POST", body),
  withdraw: (id, announcementId, expectedVersion) => request(path(id) + "/announcements/" + encodeURIComponent(announcementId) + "/withdraw", "POST", { expectedVersion }),
};
