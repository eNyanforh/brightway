import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "./grade-school.schema.js";

export function createGradeSchoolRoutes({ school, tvet, sessions, clientUrl, nodeEnv }) {
  const router = Router(), path = "/organization-workspace/:organizationId/campus/grade-school";
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const noStore = (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  const limiter = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id, message: { success: false, message: "Academic request limit reached. Retry shortly." } });
  const read = [noStore, auth, limiter], write = [...read, requireTrustedOrigin(clientUrl)];
  const actor = req => ({ accountId: req.auth.account.id, sessionId: req.auth.sessionId });
  const respond = (fn, status = 200) => async (req, res, next) => {
    try { res.status(status).json({ success: true, data: await fn(req, actor(req)) }); }
    catch (e) { next(e.status ? e : fail(503, "School operations are temporarily unavailable. Keep your work and retry.")); }
  };
  router.get(path, read, respond((r, a) => school.setup(a, r.params.organizationId, r.query)));
  router.get(path + "/admissions", read, respond((r, a) => school.acceptedAdmissions(a, r.params.organizationId, r.query)));
  for (const kind of ["subjects", "classes", "sections", "years", "periods", "offerings"]) router.post(path + "/" + kind, write, respond((r, a) => school.configure(a, r.params.organizationId, kind, r.body), 201));
  router.put(path + "/offerings/:id/teacher", write, respond((r, a) => school.assign(a, r.params.organizationId, r.params.id, r.body)));
  router.get(path + "/offerings/:id", read, respond((r, a) => school.subject(a, r.params.organizationId, r.params.id)));
  router.get(path + "/registrations", read, respond((r, a) => school.registrations(a, r.params.organizationId, r.query)));
  router.post(path + "/registrations", write, respond((r, a) => school.register(a, r.params.organizationId, r.body), 201));
  router.put(path + "/registrations/:id/status", write, respond((r, a) => school.changeStatus(a, r.params.organizationId, "registration", r.params.id, r.body)));
  router.put(path + "/students/:id/status", write, respond((r, a) => school.changeStatus(a, r.params.organizationId, "student", r.params.id, r.body)));
  router.get(path + "/registrations/:id/report", read, respond((r, a) => school.staffReport(a, r.params.organizationId, r.params.id)));
  router.post(path + "/guardians", write, respond((r, a) => school.linkGuardian(a, r.params.organizationId, r.body), 201));
  router.put(path + "/guardians/:id", write, respond((r, a) => school.guardianDecision(a, r.params.id, r.body, r.params.organizationId)));
  router.post(path + "/schedules", write, respond((r, a) => school.createSchedule(a, r.params.organizationId, r.body), 201));
  router.delete(path + "/schedules/:id", write, respond((r, a) => school.removeSchedule(a, r.params.organizationId, r.params.id)));
  for (const kind of ["attendance", "assessments"]) {
    router.post(path + "/" + kind, write, respond((r, a) => school.createSession(a, r.params.organizationId, kind, r.body), 201));
    router.put(path + "/" + kind + "/:id", write, respond((r, a) => school.submit(a, r.params.organizationId, kind, r.params.id, r.body)));
  }
  router.get("/my-campus", read, respond((r, a) => tvet ? Promise.all([school.myCampus(a), tvet.myCampus(a)]).then(pages => ({ items: pages.flatMap(p => p.items) })) : school.myCampus(a)));
  router.get("/my-campus/guardians", read, respond((r, a) => tvet ? Promise.all([school.guardianRequests(a), tvet.supporters(a)]).then(pages => ({ items: pages.flatMap(p => p.items) })) : school.guardianRequests(a)));
  router.put("/my-campus/guardians/:id", write, respond((r, a) => school.guardianDecision(a, r.params.id, r.body)));
  router.get("/my-campus/guardians/registrations/:id", read, respond((r, a) => school.learnerReport(a, r.params.id, true)));
  router.get("/my-campus/registrations/:id", read, respond((r, a) => school.learnerReport(a, r.params.id)));
  return router;
}
