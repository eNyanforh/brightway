import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createPeopleSuggestionRoutes({ suggest, sessions, nodeEnv }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const limit = rateLimit({
    windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id,
    message: { success: false, message: "Too many requests. Try again shortly." },
  });
  router.get("/explore/suggestions/people", (_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  }, auth, limit, async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw fail(400, "This endpoint does not accept search parameters.");
      const actor = { accountId: req.auth.account.id, sessionId: req.auth.sessionId };
      res.json({ success: true, data: await suggest(actor) });
    } catch (error) {
      next(error.status ? error : fail(503, "Suggestions are temporarily unavailable."));
    }
  });
  return router;
}
