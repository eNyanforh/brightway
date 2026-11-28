import { Router } from "express";
import { createCampusRollout } from "./campus-rollout.js";
import { createCampusRoutes } from "./campus.routes.js";
import { createCampusService } from "./campus.service.js";
import { createGradeSchoolService } from "../grade-school/grade-school.service.js";
import { createGradeSchoolRoutes } from "../grade-school/grade-school.routes.js";
import { createTvetService } from "../tvet/tvet.service.js";
import { createTvetRoutes } from "../tvet/tvet.routes.js";
import { createBillingService } from "../billing/billing.service.js";
import { createBillingRoutes } from "../billing/billing.routes.js";
import { createRequireAuth, createSessionCookieConfig } from "../auth/session.http.js";

export function createCampusPreviewRoutes({ prisma, sessions, clientUrl, nodeEnv, config = {} }) {
  const rollout = createCampusRollout({ ...config, NODE_ENV: nodeEnv });
  const router = Router(), common = { sessions, clientUrl, nodeEnv };
  const unavailable = res => res.status(404).json({ success: false, message: "Virtual Campus is unavailable." });
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  router.use((req, res, next) => {
    const match = req.path.match(/^\/organization-workspace\/([^/]+)\/campus(?:\/|$)/);
    if (!match && !req.path.startsWith('/my-campus')) return next('router');
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (!rollout.enabled || match && !rollout.allows(match[1])) return unavailable(res);
    next();
  });
  // Relationship authorization remains in the academic services. This outer
  // guard also prevents copied learner URLs from escaping the preview allowlist.
  router.use('/my-campus', auth, async (req, res, next) => {
    try {
      if (['/', '/guardians'].includes(req.path)) return next();
      const patterns = [
        [/^\/registrations\/([^/]+)$/, 'gradeSchoolRegistration'],
        [/^\/guardians\/registrations\/([^/]+)$/, 'gradeSchoolRegistration'],
        [/^\/guardians\/([^/]+)$/, 'gradeSchoolGuardian'],
        [/^\/tvet\/(?:supporters\/)?enrolments\/([^/]+)$/, 'tvetEnrolment'],
        [/^\/tvet\/supporters\/([^/]+)$/, 'tvetSupporter'],
      ];
      for (const [pattern, model] of patterns) {
        const match = req.path.match(pattern);
        if (!match) continue;
        if (!/^[a-f0-9-]{36}$/i.test(match[1])) return unavailable(res);
        const row = await prisma[model].findUnique({ where: { id: match[1] }, select: { campusId: true } });
        return row && rollout.allows(row.campusId) ? next() : unavailable(res);
      }
      return unavailable(res);
    } catch (e) { next(e); }
  });
  const scoped = service => new Proxy(service, { get(target, key) {
    if (!['myCampus', 'guardianRequests', 'supporters'].includes(key)) return target[key];
    return async (...args) => { const result = await target[key](...args); return { ...result, items: result.items.filter(row => rollout.allows(row.campusId)) }; };
  } });
  const school = scoped(createGradeSchoolService({ prisma })), tvet = scoped(createTvetService({ prisma }));
  router.use(createCampusRoutes({ ...common, campus: createCampusService({ prisma }), isEnabledFor: rollout.allows }));
  router.use(createGradeSchoolRoutes({ ...common, school, tvet }));
  router.use(createTvetRoutes({ ...common, tvet }));
  router.use(createBillingRoutes({ ...common, billing: createBillingService({ prisma }), institutionalOnly: true }));
  return router;
}
