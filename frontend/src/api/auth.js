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

async function request(path, { body, signal } = {}) {
  let response;

  try {
    response = await fetch(baseUrl + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      signal,

      headers:
        body === undefined
          ? undefined
          : { "Content-Type": "application/json" },

      body:
        body === undefined
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
  register: (body) =>
    request("/auth/register", { body }),

  login: (body) =>
    request("/auth/login", { body }),

  me: (signal) =>
    request("/auth/me", { signal }),

  logout: () =>
    request("/auth/logout", { body: {} }),
};