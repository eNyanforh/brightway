import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createNotificationsRoutes({ notifications, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const actor = req => ({ accountId: req.auth.account.id, sessionId: req.auth.sessionId });
  const emptyBody = body => body === undefined || body !== null && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0;
  const wrap = work => async (req, res, next) => {
    try { res.json({ success: true, data: await work(req) }); }
    catch (error) { next(error.status ? error : fail(503, "Notifications are temporarily unavailable. Reload saved state before retrying.")); }
  };

  router.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  }, auth);

  router.post("/profiles/:username/view", origin, limiter || rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }), (req, res, next) => Object.keys(req.query).length || !emptyBody(req.body) ? next(fail(400, "This profile view does not accept extra fields.")) : next(), wrap(req => notifications.viewProfile(actor(req), req.params.username)));
  router.get("/notifications", wrap(req => {
    const allowed = new Set(["cursor"]);
    if (Object.keys(req.query).some(key => !allowed.has(key))) throw fail(400, "Please check the notification page link.");
    const cursor = req.query.cursor;
    if (Array.isArray(cursor)) throw fail(400, "This notification page link is invalid.");
    return notifications.list(actor(req), cursor);
  }));
  router.post("/notifications/read-all", origin, wrap(req => {
    if (Object.keys(req.query).length || !emptyBody(req.body)) throw fail(400, "This request does not accept extra fields.");
    return notifications.markAllRead(actor(req));
  }));
  router.post("/notifications/:id/dismiss", origin, wrap(req => {
    if (Object.keys(req.query).length || !emptyBody(req.body)) throw fail(400, "This request does not accept extra fields.");
    return notifications.dismiss(actor(req), req.params.id);
  }));
  router.post("/notifications/:id/read", origin, wrap(req => {
    if (Object.keys(req.query).length || !emptyBody(req.body)) throw fail(400, "This request does not accept extra fields.");
    return notifications.markRead(actor(req), req.params.id);
  }));
  return router;
}
