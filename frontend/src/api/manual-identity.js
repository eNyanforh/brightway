import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, { method = "GET", body, file, signal } = {}) {
  let response;
  try {
    response = await fetch(base + path, { method, signal, credentials: "include", cache: "no-store",
      headers: file ? { "Content-Type": file.type, "X-Identity-Consent": "manual-identity-upload-v1" } : body ? { "Content-Type": "application/json" } : undefined,
      body: file || (body ? JSON.stringify(body) : undefined) });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Unable to reach BrightWay. Keep this page open and retry or reload the review status.");
  }
  let payload;
  try { payload = await response.json(); } catch { throw new ApiError("BrightWay returned an unexpected response. Reload the review status.", response.status); }
  if (!response.ok || payload.success !== true) throw new ApiError(payload.message || "Identity request failed.", response.status);
  return payload.data;
}
export const manualIdentityApi = {
  completeDetails: (body) => request("/manual-identity/details", { method: "POST", body }),
  status: (signal) => request("/manual-identity/status", { signal }),
  owner: (signal) => request("/manual-identity", { signal }),
  evidence: (signal) => request("/manual-identity/evidence", { signal }),
  upload: (kind, file) => request(`/manual-identity/evidence/${kind}`, { method: "POST", file }),
  remove: (id) => request(`/manual-identity/evidence/${encodeURIComponent(id)}`, { method: "DELETE" }),
  submit: (body) => request("/manual-identity/submit", { method: "POST", body }),
  access: (signal) => request("/admin/manual-identity/access", { signal }),
  queue: (cursor, signal) => request(`/admin/manual-identity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }),
  detail: (id) => request(`/admin/manual-identity/${encodeURIComponent(id)}`),
  assign: (id, expectedVersion) => request(`/admin/manual-identity/${encodeURIComponent(id)}/assign`, { method: "POST", body: { expectedVersion } }),
  decide: (id, body) => request(`/admin/manual-identity/${encodeURIComponent(id)}/decision`, { method: "POST", body }),
  async download(id, attached = true) {
    let response;
    try { response = await fetch(base + `/manual-identity/${attached ? "documents" : "evidence"}/${encodeURIComponent(id)}/download`, { credentials: "include", cache: "no-store" }); }
    catch { throw new ApiError("Unable to download the identity image."); }
    if (!response.ok) {
      let data; try { data = await response.json(); } catch { /* Use the generic message. */ }
      throw new ApiError(data?.message || "Unable to download the identity image.", response.status);
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = "identity-image.webp";
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
