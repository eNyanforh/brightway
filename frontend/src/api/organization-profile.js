import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
export const organizationPictureUrl = (id, photoId) => `${base}/organizations/${encodeURIComponent(id)}/photo/${encodeURIComponent(photoId)}`;
async function request(id, { method = "GET", body, headers, photo = false, signal } = {}) {
  let response;
  try { response = await fetch(`${base}/organization-workspace/${encodeURIComponent(id)}/profile${photo ? "/photo" : ""}`, { method, body, headers, signal, credentials: "include", cache: "no-store" }); }
  catch (error) { if (error.name === "AbortError") throw error; throw new ApiError("Unable to reach BrightWay. Keep your changes and reload the saved profile before retrying."); }
  let result;
  try { result = await response.json(); } catch { throw new ApiError("Unexpected profile response. Reload the saved profile before retrying.", response.status); }
  if (!response.ok || result.success !== true) throw new ApiError(result.message || "Organization profile is unavailable.", response.status);
  const profile = result.data;
  if (profile?.organization?.id !== id || typeof profile.required !== "boolean" || typeof profile.canEdit !== "boolean" || !Number.isInteger(profile.version)) throw new ApiError("Unexpected organization profile. Reload before continuing.");
  return profile.photo ? { ...profile, photo: { id: profile.photo.id, url: organizationPictureUrl(id, profile.photo.id) } } : profile;
}
export const organizationProfileApi = {
  read: (id, signal) => request(id, { signal }),
  save: (id, username, expectedVersion, signal) => request(id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, expectedVersion }), signal }),
  upload: (id, file, version, signal) => request(id, { method: "POST", photo: true, headers: { "Content-Type": file.type, "X-Organization-Profile-Version": String(version) }, body: file, signal }),
};
