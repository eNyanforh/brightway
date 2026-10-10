import { parse } from "cookie";

export function createSessionCookieConfig(nodeEnv) {
  const secure = nodeEnv === "production";
  return {
    name: secure ? "__Host-brightway_session" : "brightway_session",
    options: { httpOnly: true, secure, sameSite: "lax", path: "/" },
  };
}

export function readSessionToken(req, cookieName) {
  return parse(req.headers.cookie ?? "")[cookieName];
}

export function requireTrustedOrigin(clientUrl) {
  const trustedOrigin = new URL(clientUrl).origin;
  return function checkOrigin(req, res, next) {
    if (req.get("Origin") !== trustedOrigin) {
      return res.status(403).json({ success: false, message: "Request origin is not allowed." });
    }
    next();
  };
}

export function createRequireAuth({ sessions, cookieName }) {
  return async function requireAuth(req, res, next) {
    try {
      req.auth = await sessions.authenticate(readSessionToken(req, cookieName));
      next();
    } catch (error) {
      next(error);
    }
  };
}
