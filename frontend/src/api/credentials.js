import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, { body, file, revision, signal } = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      method: file || body ? "POST" : "GET", credentials: "include", cache: "no-store", signal,
      headers: file ? { "Content-Type": file.type, "X-Record-Revision": String(revision) } : body ? { "Content-Type": "application/json" } : undefined,
      body: file || (body ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Unable to reach BrightWay. Please try again.");
  }
  let payload;
  try { payload = await response.json(); } catch { throw new ApiError("BrightWay returned an unexpected response.", response.status); }
  if (!response.ok || !payload.success) throw new ApiError(payload.message || "Credential request failed.", response.status, payload.errors);
  return payload.data;
}
export const credentialsApi = {
  ownerReviews: (cursor, signal) => request(`/credentials${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }),
  owner: (kind, id, signal) => request(`/credentials/${kind}/${id}`, { signal }),
  upload: (kind, id, revision, file) => request(`/credentials/${kind}/${id}/evidence`, { file, revision }),
  submit: (kind, id, body) => request(`/credentials/${kind}/${id}/submit`, { body }),
  ...reviewerApi(),
  inOrganization: reviewerApi,
  issuers: (kind, query, signal) => request(`/credentials/issuers?${new URLSearchParams({ kind, query })}`, { signal }),
  async download(id, contentType) {
    const response = await fetch(base + `/credentials/evidence/${id}/download`, { credentials: "include", cache: "no-store" });
    if (!response.ok) {
      let payload; try { payload = await response.json(); } catch { /* Generic message below. */ }
      throw new ApiError(payload?.message || "Unable to download evidence.", response.status);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.headers.get("Content-Disposition")?.match(/filename="(supporting-document\.(?:pdf|webp))"/)?.[1] || `supporting-document.${contentType === "application/pdf" ? "pdf" : "webp"}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

function reviewerApi(organizationId) {
  const path = organizationId ? `/organization-workspace/${encodeURIComponent(organizationId)}/credential-reviews` : "/admin/credentials";
  return {
    queue: (cursor, signal) => request(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }),
    detail: (id, signal) => request(`${path}/${encodeURIComponent(id)}`, { signal }),
    assign: (id, expectedVersion) => request(`${path}/${encodeURIComponent(id)}/assign`, { body: { expectedVersion } }),
    decide: (id, body) => request(`${path}/${encodeURIComponent(id)}/decision`, { body }),
  };
}
