import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, { method = "GET", body, signal } = {}) {
  let response;
  try { response = await fetch(base + path, { method, signal, credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch (error) { if (error.name === "AbortError") throw error; throw new ApiError("Unable to reach BrightWay. Reload the photo request before retrying."); }
  let payload;
  try { payload = await response.json(); } catch { throw new ApiError("Unexpected photo review response. Reload before continuing.", response.status); }
  if (!response.ok || payload.success !== true) throw new ApiError(payload.message || "Photo review is unavailable.", response.status);
  return payload.data;
}
export const profilePhotoReviewsApi = {
  queue: (cursor, signal) => request(`/admin/profile-photos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }),
  detail: (id, signal) => request(`/admin/profile-photos/${encodeURIComponent(id)}`, { signal }),
  assign: (id, expectedVersion) => request(`/admin/profile-photos/${encodeURIComponent(id)}/assign`, { method: "POST", body: { expectedVersion } }),
  decide: (id, body) => request(`/admin/profile-photos/${encodeURIComponent(id)}/decision`, { method: "POST", body }),
  cancel: (id, body) => request(`/profile/me/photo-review/${encodeURIComponent(id)}`, { method: "DELETE", body }),
  async image(id, which, signal) {
    let response;
    try { response = await fetch(base + `/admin/profile-photos/${encodeURIComponent(id)}/images/${which}`, { signal, credentials: "include", cache: "no-store" }); }
    catch (error) { if (error.name === "AbortError") throw error; throw new ApiError("The private profile image could not be loaded."); }
    if (!response.ok) {
      let payload; try { payload = await response.json(); } catch { /* Use the generic message. */ }
      throw new ApiError(payload?.message || "The private profile image could not be loaded.", response.status);
    }
    return response.blob();
  },
};
