import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, signal) {
  let response;
  try { response = await fetch(base + path, { credentials: "include", cache: "no-store", signal }); }
  catch (error) { if (error.name === "AbortError") throw error; throw new ApiError("Unable to reach BrightWay management. Refresh to check access again."); }
  let result; try { result = await response.json(); } catch { throw new ApiError("Management returned an unexpected response.", response.status); }
  if (!response.ok || result.success !== true) throw new ApiError(result.message || "Management access is unavailable.", response.status);
  return result.data;
}
export const managementApi = { access: signal => request("/management/access", signal), context: signal => request("/management", signal) };
