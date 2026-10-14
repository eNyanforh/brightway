import { ApiError } from "./auth";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(
  /\/$/,
  "",
);

async function request(
  path,
  { method = "GET", body, image, version, signal } = {},
) {
  let response;
  try {
    response = await fetch(baseUrl + path, {
      method,
      credentials: "include",
      cache: "no-store",
      signal,
      headers: image
        ? { "Content-Type": image.type, "X-Profile-Version": String(version) }
        : body
          ? { "Content-Type": "application/json" }
          : undefined,
      body: image || (body ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      "Unable to reach BrightWay. Your edits are still here. Please try again.",
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      "BrightWay returned an unexpected response. Reload your profile before retrying.",
      response.status,
    );
  }
  if (!response.ok || payload.success !== true) {
    throw new ApiError(
      payload.message || "Unable to save your profile.",
      response.status,
      payload.errors || [],
    );
  }
  return payload;
}

export const profileApi = {
  read: async (signal) =>
    (await request("/profile/me", { signal })).data.profile,
  save: async (expectedVersion, changes) =>
    (
      await request("/profile/me", {
        method: "PATCH",
        body: { expectedVersion, changes },
      })
    ).data.profile,
  uploadPhoto: async (image, version) =>
    (
      await request("/profile/me/photo", {
        method: "POST",
        image,
        version,
      })
    ).data,
};

export function photoUrl(id) {
  return baseUrl + "/photos/" + encodeURIComponent(id);
}