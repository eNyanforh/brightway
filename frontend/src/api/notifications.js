import { ApiError } from "./auth";
import { resourceFetch } from "./read-cache";

const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

async function request(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await resourceFetch(base + path, {
      method,
      credentials: "include",
      cache: "no-store",
      signal,
      ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Unable to reach BrightWay. Your saved notifications are still safe; reload to try again.");
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError("BrightWay returned an unexpected notification response.", response.status); }
  if (!response.ok || payload.success !== true) throw new ApiError(payload.message || "Unable to load notifications.", response.status);
  return payload.data;
}

export const notificationsApi = {
  viewProfile: (username, signal) => request(`/profiles/${encodeURIComponent(username)}/view`, { method: "POST", body: {}, signal }),
  list: (cursor, signal) => request(`/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }),
  markRead: id => request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: {} }),
  dismiss: id => request(`/notifications/${encodeURIComponent(id)}/dismiss`, { method: "POST", body: {} }),
  markAllRead: () => request("/notifications/read-all", { method: "POST", body: {} }),
};
