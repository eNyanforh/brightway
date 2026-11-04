import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireManagement } from "./management-auth.http.js";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
const privateHeaders = (_req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
const wrap = work => async (req, res, next) => {
  try { res.json({ success: true, data: await work(req) }); }
  catch (error) { next(error.status >= 400 && error.status <= 599 ? error : Object.assign(Error("This operation is temporarily unavailable. Reload its saved state before retrying."), { status: 503 })); }
};
const actor = req => ({ staffId: req.management.staff.id, sessionId: req.management.sessionId });
const noQuery = (req, _res, next) => Object.keys(req.query).length ? next(Object.assign(Error("This action accepts no query parameters."), { status: 400 })) : next();
export function createManagementOperationsRoutes({ operations, cases, authentication, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = requireManagement(authentication, nodeEnv), origin = requireTrustedOrigin(clientUrl);
  const limits = limiter || rateLimit({ windowMs: 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.management.staff.id });
  router.use("/management/tools", privateHeaders, auth, limits);
  for (const kind of ["users", "organizations", "team"]) router.get(`/management/tools/${kind}`, wrap(req => operations.directory(actor(req), kind, req.query)));
  for (const kind of ["users", "organizations"]) {
    router.get(`/management/tools/${kind}/:id`, noQuery, wrap(req => operations.entity(actor(req), kind, req.params.id)));
    router.post(`/management/tools/${kind}/:id/actions`, origin, noQuery, wrap(req => operations.control(actor(req), kind, req.params.id, req.body)));
  }
  router.get("/management/tools/audit", wrap(req => operations.audit(actor(req), req.query)));
  router.get("/management/tools/operations", noQuery, wrap(req => operations.operations(actor(req))));
  router.get("/management/tools/cases", wrap(req => cases.list(actor(req), req.query)));
  router.post("/management/tools/cases", origin, noQuery, wrap(req => cases.create(req.body, actor(req))));
  router.get("/management/tools/cases/:id", wrap(req => { if (Object.keys(req.query).some(k => k !== "messageCursor")) throw Object.assign(Error("Unknown case query."), { status: 400 }); return cases.detail(actor(req), req.params.id, req.query.messageCursor); }));
  router.post("/management/tools/cases/:id/actions", origin, noQuery, wrap(req => cases.action(actor(req), req.params.id, req.body)));
  router.post("/management/tools/cases/:id/messages", origin, noQuery, wrap(req => cases.message(actor(req), req.params.id, req.body)));
  return router;
}
export function createSupportRoutes({ cases, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name }), origin = requireTrustedOrigin(clientUrl);
  const limits = limiter || rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.auth.account.id });
  router.use("/support/cases", privateHeaders, auth, limits);
  const owner = req => ({ accountId: req.auth.account.id });
  router.get("/support/cases", wrap(req => cases.list(owner(req), req.query)));
  router.post("/support/cases", origin, noQuery, wrap(req => cases.create(req.body, owner(req))));
  router.get("/support/cases/:id", wrap(req => { if (Object.keys(req.query).some(k => k !== "messageCursor")) throw Object.assign(Error("Unknown case query."), { status: 400 }); return cases.detail(owner(req), req.params.id, req.query.messageCursor); }));
  router.post("/support/cases/:id/messages", origin, noQuery, wrap(req => cases.message(owner(req), req.params.id, req.body)));
  return router;
}
