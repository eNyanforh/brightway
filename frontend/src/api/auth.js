const baseUrl = (
  import.meta.env.VITE_API_BASE_URL || "/api/v1"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status = 0, errors = []) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function request(path, { body, signal, image } = {}) {
  let response;

  try {
    response = await fetch(baseUrl + path, {
      method: body === undefined && image === undefined ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      signal,

      headers:
        image !== undefined ? { "Content-Type": image.type } : body === undefined
          ? undefined
          : { "Content-Type": "application/json" },

      body:
        image !== undefined ? image : body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;

    throw new ApiError(
      "Unable to reach BrightWay. Check your connection and try again."
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      "BrightWay returned an unexpected response. Please try again.",
      response.status
    );
  }

  if (!response.ok || payload.success !== true) {
    throw new ApiError(
      payload.message || "Request failed. Please try again.",
      response.status,
      payload.errors || []
    );
  }

  return payload.data;
}

export const authApi = {
  cancelMfaLogin: () => request("/auth/mfa/cancel-login", { body: {} }),
  mfaStatus: (signal) => request("/auth/mfa", { signal }),
  beginMfa: (password) => request("/auth/mfa/setup", { body: { password } }),
  enableMfa: (code) => request("/auth/mfa/enable", { body: { code } }),
  regenerateMfaCodes: (password, code) => request("/auth/mfa/backup-codes", { body: { password, ...(code ? { code } : {}) } }),
  disableMfa: (password, code) => request("/auth/mfa/disable", { body: { password, code } }),
  verifyMfaLogin: (code) => request("/auth/mfa/verify-login", { body: { code } }),
  requestPasswordReset: (email) => request("/auth/password-reset/request", { body: { email } }),
  confirmPasswordReset: (body) => request("/auth/password-reset/confirm", { body }),
  beginSignup: () => request("/auth/signup-drafts", { body: {} }),
  uploadSignupPhoto: (image) => request("/auth/signup-drafts/photo", { image }),
  requestSignupEmail: (email) => request("/auth/signup-email/request", { body: { email } }),
  verifySignupEmail: (email, code) => request("/auth/signup-email/verify", { body: { email, code } }),
  register: (body) =>
    request("/auth/register", { body }),

  login: (body) =>
    request("/auth/login", { body }),

  me: (signal) =>
    request("/auth/me", { signal }),

  logout: () =>
    request("/auth/logout", { body: {} }),
};