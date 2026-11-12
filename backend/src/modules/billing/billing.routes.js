import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { requireManagement } from "../management/management-auth.http.js";
export function createBillingRoutes({ billing, sessions, authentication, clientUrl, nodeEnv }) {
  const router = Router(), path = "/organization-workspace/:campusId/campus/billing", managed = "/management/billing";
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name }), origin = requireTrustedOrigin(clientUrl);
  const noStore = (_req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  const limits = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: r => r.management?.staff.id || r.auth.account.id });
  const actor = r => r.management ? { staffId: r.management.staff.id, sessionId: r.management.sessionId } : { accountId: r.auth.account.id, sessionId: r.auth.sessionId };
  const wrap = fn => async (req, res, next) => { try { res.json({ success: true, data: await fn(req, actor(req)) }); } catch (e) { next(e.status ? e : Object.assign(Error("Billing is temporarily unavailable. Check the saved payment state before retrying."), { status: 503 })); } };
  const noQuery = (r, _s, next) => Object.keys(r.query).length ? next(Object.assign(Error("This billing action accepts no query fields."), { status: 400 })) : next();
  router.get(path, noStore, auth, wrap((r, a) => billing.statement(a, r.params.campusId, r.query)));
  router.get(path + "/history/:kind", noStore, auth, wrap((r, a) => billing.history(a, r.params.campusId, r.params.kind, r.query)));
  router.post(path + "/semesters", noStore, auth, origin, limits, noQuery, wrap((r, a) => billing.createSemester(a, r.params.campusId, r.body)));
  router.post(path + "/reconcile", noStore, auth, origin, limits, wrap((r, a) => billing.reconcile(a, r.params.campusId, r.body)));
  router.post(path + "/payments", noStore, auth, origin, limits, noQuery, wrap((r, a) => billing.submitPayment(a, r.params.campusId, r.body)));
  router.use(managed, noStore, requireManagement(authentication, nodeEnv), limits);
  router.get(managed, wrap((r, a) => billing.queue(a, r.query)));
  router.get(managed + "/accounts", wrap((r, a) => billing.accounts(a, r.query)));
  router.get(managed + "/:campusId", wrap((r, a) => billing.statement(a, r.params.campusId, r.query, true)));
  router.get(managed + "/:campusId/history/:kind", wrap((r, a) => billing.history(a, r.params.campusId, r.params.kind, r.query, true)));
  router.post(managed + "/:campusId/payments/:paymentId/decision", origin, noQuery, wrap((r, a) => billing.decide(a, r.params.campusId, r.params.paymentId, r.body)));
  router.post(managed + "/:campusId/charges/:chargeId/adjustments", origin, noQuery, wrap((r, a) => billing.adjust(a, r.params.campusId, r.params.chargeId, r.body)));
  return router;
}
