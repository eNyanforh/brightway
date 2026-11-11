import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { campusError } from "./campus.schema.js";

export function createCampusRoutes({ campus, sessions, clientUrl, nodeEnv }) {
  const router = Router(), path = "/organization-workspace/:organizationId/campus";
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const noStore = (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  const limiter = rateLimit({ windowMs: 60000, limit: 35, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id, message: { success: false, message: "Campus request limit reached. Retry shortly." } });
  const read = [noStore, auth];
  const write = [noStore, auth, requireTrustedOrigin(clientUrl), limiter];
  const actor = req => ({ accountId: req.auth.account.id, sessionId: req.auth.sessionId });
  const handle = (fn, status = 200) => async (req, res, next) => {
    try { res.status(status).json({ success: true, data: await fn(req, actor(req)) }); }
    catch (error) { next(error.status ? error : campusError(503, "Virtual Campus is temporarily unavailable.")); }
  };
  router.get(path, read, handle((r, a) => campus.availability(a, r.params.organizationId)));
  router.put(path + "/setup", write, handle((r, a) => campus.setup(a, r.params.organizationId, r.body)));
  router.post(path + "/activate", write, handle((r, a) => campus.activate(a, r.params.organizationId, r.body)));
  router.post(path + "/pause", write, handle((r, a) => campus.pause(a, r.params.organizationId, r.body)));
  router.post(path + "/resume", write, handle((r, a) => campus.resume(a, r.params.organizationId, r.body)));
  router.patch(path + "/settings", write, handle((r, a) => campus.settings(a, r.params.organizationId, r.body)));
  router.get(path + "/announcements", read, handle((r, a) => campus.announcements(a, r.params.organizationId, r.query)));
  router.post(path + "/announcements", write, handle((r, a) => campus.publish(a, r.params.organizationId, r.body), 201));
  router.post(path + "/announcements/:announcementId/withdraw", write, handle((r, a) => campus.withdraw(a, r.params.organizationId, r.params.announcementId, r.body)));
  return router;
}
