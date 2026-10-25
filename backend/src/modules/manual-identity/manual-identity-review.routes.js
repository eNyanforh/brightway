import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { requireMfa } from "../auth/mfa.service.js";
export function createManualIdentityReviewRoutes({ reviews, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 3600000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false });
  const handle = (fn) => async (req, res, next) => {
    try { res.json({ success: true, data: await fn(req) }); }
    catch (error) { next(error.status >= 400 && error.status <= 599 ? error : Object.assign(Error("Identity review is temporarily unavailable."), { status: 503 })); }
  };
  // Exact owner routes avoid intercepting the already-installed evidence upload routes.
  const ownerPath = "/manual-identity", adminPath = "/admin/manual-identity";
  const privateResponse = (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  router.get(ownerPath, privateResponse, auth, handle((req) => reviews.owner(req.auth.account.id)));
  router.post(`${ownerPath}/submit`, privateResponse, auth, origin, limits, handle((req) => reviews.submit(req.auth.account.id, req.body)));
  router.get(`${ownerPath}/documents/:id/download`, privateResponse, auth, limits, async (req, res, next) => {
    try {
      const result = await reviews.download(req.auth.account.id, req.auth.sessionId, req.params.id);
      res.set({ "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="identity-image.webp"',
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" }).send(result.bytes);
    } catch (error) { next(error.status >= 400 && error.status <= 599 ? error : Object.assign(Error("Identity document is temporarily unavailable."), { status: 503 })); }
  });
  router.use(adminPath, privateResponse, auth, requireMfa);
  router.get(`${adminPath}/access`, handle((req) => reviews.access(req.auth.account.id, req.auth.sessionId)));
  router.get(adminPath, handle((req) => reviews.queue(req.auth.account.id, req.auth.sessionId, req.query.cursor)));
  router.get(`${adminPath}/:id`, handle((req) => reviews.detail(req.auth.account.id, req.auth.sessionId, req.params.id)));
  router.post(`${adminPath}/:id/assign`, origin, limits, handle((req) => reviews.transition(req.auth.account.id, req.auth.sessionId, req.params.id, req.body, true)));
  router.post(`${adminPath}/:id/decision`, origin, limits, handle((req) => reviews.transition(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  return router;
}
