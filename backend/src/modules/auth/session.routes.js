import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { loginSchema } from "./login.schema.js";
import { createSessionCookieConfig, createRequireAuth, readSessionToken, requireTrustedOrigin } from "./session.http.js";

export function createSessionRoutes({ sessions, clientUrl, nodeEnv, loginLimiter }) {
  const router = Router();
  const cookie = createSessionCookieConfig(nodeEnv);
  const trustedOrigin = requireTrustedOrigin(clientUrl);
  const requireAuth = createRequireAuth({ sessions, cookieName: cookie.name });
  const limiter = loginLimiter ?? rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts. Please try again later." },
  });

  router.post("/login", trustedOrigin, limiter, async (req, res, next) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, message: "Please enter a username/email and password." });
    }
    try {
      const session = await sessions.login(result.data, readSessionToken(req, cookie.name));
      res.cookie(cookie.name, session.token, { ...cookie.options, expires: session.expiresAt });
      res.set("Cache-Control", "no-store");
      return res.json({ success: true, message: "Logged in successfully.", data: { account: session.account } });
    } catch (error) { next(error); }
  });

  router.get("/me", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  }, requireAuth, (req, res) => {
    res.json({ success: true, data: { account: req.auth.account } });
  });

  router.post("/logout", trustedOrigin, async (req, res, next) => {
    try {
      await sessions.logout(readSessionToken(req, cookie.name));
      res.clearCookie(cookie.name, cookie.options);
      res.set("Cache-Control", "no-store");
      res.json({ success: true, message: "Logged out successfully." });
    } catch (error) { next(error); }
  });

  return router;
}
