import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createNotificationsRoutes({ notifications, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const viewLimit = limiter ?? rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: req => req.auth.account.id,
    message: { success: false, message: "Profile view limit reached. Wait a minute and try again." },
  });
  const actor = req => ({ accountId: req.auth.account.id, sessionId: req.auth.sessionId });
  const emptyBody = body => body === undefined ||
    (body !== null && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);
  const wrap = work => async (req, res, next) => {
    try { res.json({ success: true, data: await work(req) }); }
    catch (error) { next(error.status ? error : fail(503, "Notifications are temporarily unavailable. Reload saved state before retrying.")); }
  };

  const privateRoute = [(_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  }, auth];
  const noExtraFields = (req, _res, next) => {
    if (Object.keys(req.query).length || !emptyBody(req.body)) return next(fail(400, "This request does not accept extra fields."));
    next();
  };

  router.post("/profiles/:username/view", privateRoute, origin, viewLimit, noExtraFields, wrap(req => notifications.viewProfile(actor(req), req.params.username)));
  router.get("/notifications", privateRoute, wrap(req => {
    const cursor = req.query.cursor;
    const invalidCursor = cursor !== undefined &&
      (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 700);
    if (invalidCursor || Object.keys(req.query).some(key => key !== "cursor")) {
      throw fail(400, "This notification page link is invalid.");
    }
    return notifications.list(actor(req), cursor);
  }));
  router.post("/notifications/read-all", privateRoute, origin, noExtraFields, wrap(req => notifications.markAllRead(actor(req))));
  router.post("/notifications/:id/dismiss", privateRoute, origin, noExtraFields, wrap(req => notifications.dismiss(actor(req), req.params.id)));
  router.post("/notifications/:id/read", privateRoute, origin, noExtraFields, wrap(req => notifications.markRead(actor(req), req.params.id)));
  return router;
}
