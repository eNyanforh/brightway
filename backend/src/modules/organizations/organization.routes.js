import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { requireMfa } from "../auth/mfa.service.js";
export function createOrganizationRoutes({ organizations, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name }), origin = requireTrustedOrigin(clientUrl);
  const privateResponse = (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  const limits = limiter ?? rateLimit({ windowMs: 900000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.auth.account.id });
  const handle = fn => async (req, res, next) => { try { res.json({ success: true, data: await fn(req) }); } catch (e) { next(e.status >= 400 && e.status <= 599 ? e : Object.assign(Error("Organization requests are temporarily unavailable."), { status: 503 })); } };
  router.get("/organizations/:id", privateResponse, handle(req => organizations.publicOrganization(req.params.id)));
  router.use("/organization-requests", privateResponse, auth);
  router.get("/organization-requests", handle(req => organizations.ownerList(req.auth.account.id, req.auth.sessionId, req.query.cursor)));
  router.post("/organization-requests", origin, limits, handle(req => organizations.submit(req.auth.account.id, req.auth.sessionId, req.body)));
  router.get("/organization-requests/:id", handle(req => organizations.owner(req.auth.account.id, req.auth.sessionId, req.params.id)));
  router.get("/organization-operations/access", privateResponse, auth, handle(req => organizations.access(req.auth.account.id, req.auth.sessionId)));
  router.use("/admin/organizations", privateResponse, auth, requireMfa);
  router.get("/admin/organizations", handle(req => organizations.queue(req.auth.account.id, req.auth.sessionId, req.query.cursor)));
  router.get("/admin/organizations/:id", handle(req => organizations.detail(req.auth.account.id, req.auth.sessionId, req.params.id)));
  router.post("/admin/organizations/:id/assign", origin, limits, handle(req => organizations.assign(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  router.post("/admin/organizations/:id/findings", origin, limits, handle(req => organizations.report(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  router.post("/admin/organizations/:id/decision", origin, limits, handle(req => organizations.decide(req.auth.account.id, req.auth.sessionId, req.params.id, req.body)));
  return router;
}
