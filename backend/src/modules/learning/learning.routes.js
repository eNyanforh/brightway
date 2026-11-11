import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createLearningRoutes({ learning, sessions, clientUrl, nodeEnv }) {
  const router = Router();
  const access = [(req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); },
    createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name })];
  const limit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id, message: { success: false, message: "Too many learning requests. Try again shortly." } });
  const write = [...access, requireTrustedOrigin(clientUrl), limit];
  const reads = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id, message: { success: false, message: "Too many learning reads. Try again shortly." } });
  const read = [...access, reads];
  const actor = req => ({ accountId: req.auth.account.id, sessionId: req.auth.sessionId });
  const respond = (work, status = 200) => async (req, res, next) => {
    try { res.status(status).json({ success: true, data: await work(req, actor(req)) }); }
    catch (error) { next(error.status ? error : fail(503, "Learning is temporarily unavailable. Try again shortly.")); }
  };
  const download = organization => async (req, res, next) => {
    try {
      const file = await learning.readFile(actor(req), req.params.applicationId, req.params.fileId, organization ? req.params.organizationId : undefined);
      res.set({ "Content-Type": file.contentType, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
        "Content-Disposition": `attachment; filename="application-document.${file.contentType === "application/pdf" ? "pdf" : "webp"}"` }).send(file.bytes);
    } catch (error) { next(error.status ? error : fail(503, "This application file is temporarily unavailable.")); }
  };
  router.get("/learning/discover", read, respond((r, a) => learning.browse(a, r.query)));
  router.get("/learning/programs/:id", read, respond((r, a) => learning.programDetail(a, r.params.id)));
  router.get("/admission-cycles", read, respond((r, a) => learning.browse(a, { ...r.query, kind: "admissions" })));
  router.get("/admission-cycles/:id", read, respond((r, a) => learning.detail(a, r.params.id)));
  router.put("/admission-cycles/:id/application", write, respond((r, a) => learning.saveApplication(a, r.params.id, r.body)));
  router.get("/admission-applications/me", read, respond((r, a) => learning.myApplications(a, r.query)));
  router.get("/admission-applications/me/:applicationId", read, respond((r, a) => learning.application(a, r.params.applicationId)));
  router.post("/admission-applications/me/:applicationId/withdraw", write, respond((r, a) => learning.withdraw(a, r.params.applicationId, r.body)));
  router.post("/admission-applications/me/:applicationId/files", write,
    raw({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
    respond((r, a) => learning.upload(a, r.params.applicationId, r.query, r.body, r.get("Content-Type"))));
  router.get("/admission-applications/me/:applicationId/files/:fileId", read, download(false));
  const path = "/organization-workspace/:organizationId";
  router.get(path + "/programs", read, respond((r, a) => learning.programs(a, r.params.organizationId, r.query)));
  router.post(path + "/programs", write, respond((r, a) => learning.createProgram(a, r.params.organizationId, r.body), 201));
  router.patch(path + "/programs/:id", write, respond((r, a) => learning.editProgram(a, r.params.organizationId, r.params.id, r.body)));
  router.put(path + "/programs/:id/status", write, respond((r, a) => learning.programStatus(a, r.params.organizationId, r.params.id, r.body)));
  router.get(path + "/admission-cycles", read, respond((r, a) => learning.list(a, r.params.organizationId, r.query)));
  router.post(path + "/admission-cycles", write, respond((r, a) => learning.create(a, r.params.organizationId, r.body), 201));
  router.patch(path + "/admission-cycles/:id", write, respond((r, a) => learning.edit(a, r.params.organizationId, r.params.id, r.body)));
  router.put(path + "/admission-cycles/:id/status", write, respond((r, a) => learning.setStatus(a, r.params.organizationId, r.params.id, r.body)));
  router.get(path + "/admission-applications", read, respond((r, a) => learning.reviewList(a, r.params.organizationId, r.query)));
  router.get(path + "/admission-applications/:applicationId", read, respond((r, a) => learning.reviewDetail(a, r.params.organizationId, r.params.applicationId)));
  router.put(path + "/admission-applications/:applicationId/status", write, respond((r, a) => learning.decide(a, r.params.organizationId, r.params.applicationId, r.body)));
  router.get(path + "/admission-applications/:applicationId/files/:fileId", read, download(true));
  return router;
}
