import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createOpportunityRoutes({ opportunities, sessions, clientUrl, nodeEnv }) {
  const router = Router();
  const access = [(req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); },
    createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name })];
  const limit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id, message: { success: false, message: "Too many opportunity requests. Try again shortly." } });
  const write = [...access, requireTrustedOrigin(clientUrl), limit];
  const reads = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id, message: { success: false, message: "Too many opportunity reads. Try again shortly." } });
  const read = [...access, reads];
  const actor = req => ({ accountId: req.auth.account.id, sessionId: req.auth.sessionId });
  const respond = (work, status = 200) => async (req, res, next) => {
    try { res.status(status).json({ success: true, data: await work(req, actor(req)) }); }
    catch (error) { next(error.status ? error : fail(503, "Opportunities are temporarily unavailable. Try again shortly.")); }
  };
  const download = organization => async (req, res, next) => {
    try {
      const file = await opportunities.readFile(actor(req), req.params.applicationId, req.params.fileId, organization ? req.params.organizationId : undefined);
      res.set({ "Content-Type": file.contentType, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
        "Content-Disposition": `attachment; filename="application-document.${file.contentType === "application/pdf" ? "pdf" : "webp"}"` }).send(file.bytes);
    } catch (error) { next(error.status ? error : fail(503, "This application file is temporarily unavailable.")); }
  };
  router.get("/opportunities", read, respond((r, a) => opportunities.browse(a, r.query)));
  router.get("/opportunities/:id", read, respond((r, a) => opportunities.detail(a, r.params.id)));
  router.put("/opportunities/:id/save", write, respond((r, a) => opportunities.saveOpportunity(a, r.params.id, r.body)));
  router.put("/opportunities/:id/application", write, respond((r, a) => opportunities.saveApplication(a, r.params.id, r.body)));
  router.get("/applications/me", read, respond((r, a) => opportunities.myApplications(a, r.query)));
  router.get("/applications/me/:applicationId", read, respond((r, a) => opportunities.application(a, r.params.applicationId)));
  router.post("/applications/me/:applicationId/withdraw", write, respond((r, a) => opportunities.withdraw(a, r.params.applicationId, r.body)));
  router.post("/applications/me/:applicationId/files", write,
    raw({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
    respond((r, a) => opportunities.upload(a, r.params.applicationId, r.query, r.body, r.get("Content-Type"))));
  router.get("/applications/me/:applicationId/files/:fileId", read, download(false));
  const path = "/organization-workspace/:organizationId";
  router.get(path + "/opportunities", read, respond((r, a) => opportunities.list(a, r.params.organizationId, r.query)));
  router.post(path + "/opportunities", write, respond((r, a) => opportunities.create(a, r.params.organizationId, r.body), 201));
  router.patch(path + "/opportunities/:id", write, respond((r, a) => opportunities.edit(a, r.params.organizationId, r.params.id, r.body)));
  router.put(path + "/opportunities/:id/status", write, respond((r, a) => opportunities.setStatus(a, r.params.organizationId, r.params.id, r.body)));
  router.get(path + "/applications", read, respond((r, a) => opportunities.reviewList(a, r.params.organizationId, r.query)));
  router.get(path + "/applications/:applicationId", read, respond((r, a) => opportunities.reviewDetail(a, r.params.organizationId, r.params.applicationId)));
  router.put(path + "/applications/:applicationId/status", write, respond((r, a) => opportunities.decide(a, r.params.organizationId, r.params.applicationId, r.body)));
  router.get(path + "/applications/:applicationId/files/:fileId", read, download(true));
  return router;
}
