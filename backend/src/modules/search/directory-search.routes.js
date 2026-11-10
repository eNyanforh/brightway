import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createDirectorySearchRoutes({ search, contentSearch, sessions, nodeEnv }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const limit = rateLimit({
    windowMs: 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id,
    message: { success: false, message: "Too many searches. Try again shortly." },
  });
  router.get("/search", (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  }, auth, limit, async (req, res, next) => {
    try {
      const actor = { accountId: req.auth.account.id, sessionId: req.auth.sessionId };
      res.json({ success: true, data: await search(actor, req.query) });
    } catch (error) {
      next(error.status ? error : fail(503, "Search is temporarily unavailable. Try again shortly."));
    }
  });
  router.get("/search/content", (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  }, auth, limit, async (req, res, next) => {
    try {
      const actor = { accountId: req.auth.account.id, sessionId: req.auth.sessionId };
      res.json({ success: true, data: await contentSearch(actor, req.query) });
    } catch (error) {
      next(error.status ? error : fail(503, "Content search is temporarily unavailable. Try again shortly."));
    }
  });
  return router;
}
