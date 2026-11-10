import { ApiError } from "./auth";

const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

export async function searchContent(q, kind, cursor, signal) {
  const query = new URLSearchParams({ q, kind });
  if (cursor) query.set("cursor", cursor);
  let response;
  try {
    response = await fetch(base + "/search/content?" + query, {
      credentials: "include", cache: "no-store", signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Unable to reach BrightWay. Try the search again.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true || !Array.isArray(result.data?.items)) {
    throw new ApiError(result?.message || "Content search is temporarily unavailable.", response.status);
  }
  return result.data;
}
