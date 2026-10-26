import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { requireMfa } from "../auth/mfa.service.js";

export function createIdentityNameChangeRoutes({ changes, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 15 * 60000, limit: 120, keyGenerator: req => req.auth.account.id, standardHeaders: "draft-8", legacyHeaders: false });
  const privacy = (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  const handle = work => async (req, res, next) => { try { res.json({ success: true, data: await work(req) }); } catch (e) { next(e.status >= 400 && e.status <= 599 ? e : Object.assign(Error("Name correction is temporarily unavailable."), { status: 503 })); } };
  const owner = "/manual-identity/name-changes", admin = "/admin/name-changes";
  router.use(owner, privacy, auth, limits);
  router.get(owner, handle(req => changes.owner(req.auth.account.id)));
  router.post(owner, origin, handle(req => changes.submit(req.auth.account.id, req.auth.sessionId, req.body)));
  router.delete(`${owner}/:id`, origin, handle(req => changes.cancel(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  router.get(`${owner}/:id/evidence/:imageId`, async (req, res, next) => {
    try {
      const bytes = await changes.image(req.auth.account.id, req.auth.sessionId, req.params.id, req.params.imageId);
      res.set({ "Content-Type": "image/webp", "Content-Disposition": 'inline; filename="identity-evidence.webp"', "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" }).send(bytes);
    } catch (e) { next(e.status >= 400 && e.status <= 599 ? e : Object.assign(Error("Identity evidence is temporarily unavailable."), { status: 503 })); }
  });
  router.use(admin, privacy, auth, requireMfa, limits);
  router.get(admin, handle(req => changes.queue(req.auth.account.id, req.auth.sessionId, req.query.cursor)));
  router.get(`${admin}/:id`, handle(req => changes.detail(req.auth.account.id, req.auth.sessionId, req.params.id)));
  router.get(`${admin}/:id/portrait`, async (req, res, next) => {
    try {
      const bytes = await changes.portrait(req.auth.account.id, req.auth.sessionId, req.params.id);
      res.set({ "Content-Type": "image/webp", "Content-Disposition": 'inline; filename="approved-portrait.webp"', "X-Content-Type-Options": "nosniff" }).send(bytes);
    } catch (e) { next(e.status >= 400 && e.status <= 599 ? e : Object.assign(Error("Approved portrait is unavailable."), { status: 503 })); }
  });
  router.post(`${admin}/:id/assign`, origin, handle(req => changes.assign(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  router.post(`${admin}/:id/decision`, origin, handle(req => changes.decide(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  return router;
}
