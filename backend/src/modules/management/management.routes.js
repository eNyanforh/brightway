import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig } from "../auth/session.http.js";
import { requireMfa } from "../auth/mfa.service.js";
export function createManagementRoutes({ management, sessions, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const limits = limiter ?? rateLimit({ windowMs: 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.auth.account.id });
  router.use("/management", (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); }, auth, limits);
  const handle = work => async (req, res, next) => {
    try { if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: "Management context uses the signed-in account only." }); res.json({ success: true, data: await work(req.auth.account.id, req.auth.sessionId) }); }
    catch (error) { next(error.status >= 400 && error.status <= 599 ? error : Object.assign(Error("BrightWay management is temporarily unavailable."), { status: 503 })); }
  };
  router.get("/management/access", handle((a, s) => management.access(a, s)));
  router.get("/management/statistics", requireMfa, handle((a, s) => management.statistics(a, s)));
  router.get("/management", requireMfa, handle((a, s) => management.context(a, s)));
  return router;
}
