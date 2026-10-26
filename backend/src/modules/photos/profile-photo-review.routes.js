import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { requireMfa } from "../auth/mfa.service.js";

export function createProfilePhotoReviewRoutes({ reviews, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, keyGenerator: (req) => req.auth.account.id, standardHeaders: "draft-8", legacyHeaders: false });
  const privacy = (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  const handle = (work) => async (req, res, next) => {
    try { res.json({ success: true, data: await work(req) }); }
    catch (error) { next(error.status >= 400 && error.status <= 599 ? error : Object.assign(Error("Profile photo review is temporarily unavailable."), { status: 503 })); }
  };
  router.delete("/profile/me/photo-review/:id", privacy, auth, origin, limits,
    handle((req) => reviews.cancel(req.auth.account.id, req.params.id, req.body)));
  const base = "/admin/profile-photos";
  router.use(base, privacy, auth, requireMfa, limits);
  router.get(base, handle((req) => reviews.queue(req.auth.account.id, req.auth.sessionId, req.query.cursor)));
  router.get(`${base}/:id`, handle((req) => reviews.detail(req.auth.account.id, req.auth.sessionId, req.params.id)));
  router.post(`${base}/:id/assign`, origin, handle((req) => reviews.assign(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  router.post(`${base}/:id/decision`, origin, handle((req) => reviews.decide(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  router.get(`${base}/:id/images/:which`, async (req, res, next) => {
    try {
      const bytes = await reviews.image(req.auth.account.id, req.auth.sessionId, req.params.id, req.params.which);
      res.set({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="profile-photo.webp"' }).send(bytes);
    } catch (error) { next(error.status >= 400 && error.status <= 599 ? error : Object.assign(Error("Profile image is temporarily unavailable."), { status: 503 })); }
  });
  return router;
}
