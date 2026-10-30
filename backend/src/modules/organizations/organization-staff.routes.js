import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
export function createOrganizationStaffRoutes({ staff, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name }), origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 900000, limit: 80, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.auth.account.id });
  router.use(["/organization-workspace", "/organization-invitations", "/my-workspace"], (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); }, auth);
  const handle = fn => async (req, res, next) => { try { res.json({ success: true, data: await fn(req, req.auth.account.id, req.auth.sessionId) }); } catch (e) { next(e.status >= 400 && e.status <= 599 ? e : Object.assign(Error("Organization staffing is temporarily unavailable."), { status: 503 })); } };
  router.get("/my-workspace", handle((r, a, s) => staff.directory(a, s, r.query)));
  router.get("/organization-workspace", handle((r, a, s) => staff.home(a, s, r.query)));
  router.get("/organization-workspace/:orgId", handle((r, a, s) => staff.context(a, s, r.params.orgId)));
  const analyticsLimits = limiter ?? rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.auth.account.id, message: { success: false, message: "Dashboard refresh limit reached. Wait a minute and retry." } });
  router.get("/organization-workspace/:orgId/dashboard", analyticsLimits, handle((r, a, s) => staff.dashboard(a, s, r.params.orgId, r.query)));
  router.get("/organization-workspace/:orgId/staff", handle((r, a, s) => staff.staff(a, s, r.params.orgId, r.query)));
  const photoLimits = limiter ?? rateLimit({ windowMs: 60000, limit: 150, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.auth.account.id });
  router.get("/organization-workspace/:orgId/staff/people/:accountId/photo/:photoId", photoLimits, async (req, res, next) => {
    try {
      const bytes = await staff.photo(req.auth.account.id, req.auth.sessionId, req.params.orgId, req.params.accountId, req.params.photoId);
      res.set({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="staff-photo.webp"' }).send(bytes);
    } catch (e) { next(e.status >= 400 && e.status <= 599 ? e : Object.assign(Error("Staff photos are temporarily unavailable."), { status: 503 })); }
  });
  router.post("/organization-workspace/:orgId/invitations", origin, limits, handle((r, a, s) => staff.invite(a, s, r.params.orgId, r.body)));
  router.post("/organization-workspace/:orgId/invitations/:id/cancel", origin, limits, handle((r, a, s) => staff.cancel(a, s, r.params.orgId, r.params.id, r.body)));
  router.patch("/organization-workspace/:orgId/members/:id", origin, limits, handle((r, a, s) => staff.change(a, s, r.params.orgId, r.params.id, r.body)));
  router.post("/organization-invitations/:id/respond", origin, limits, handle((r, a, s) => staff.respond(a, s, r.params.id, r.body)));
  return router;
}
