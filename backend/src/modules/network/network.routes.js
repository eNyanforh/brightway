import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "./network.schema.js";
export function createNetworkRoutes({ network, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name }), origin = requireTrustedOrigin(clientUrl);
  router.use("/network", (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); }, auth);
  const actor = req => ({ accountId: req.auth.account.id, sessionId: req.auth.sessionId });
  const wrap = work => async (req, res, next) => { try { res.json({ success: true, data: await work(req) }); } catch (error) { next(error.status ? error : fail(503, "Network is temporarily unavailable. Reload saved state before retrying.")); } };
  const noQuery = (req, res, next) => Object.keys(req.query).length ? next(fail(400, "This network request does not accept query fields.")) : next();
  router.get("/network", wrap(req => network.list(actor(req), req.query)));
  router.get("/network/people/:username", noQuery, wrap(req => network.person(actor(req), req.params.username)));
  router.get("/network/people/:username/contact", noQuery, wrap(req => network.visibleContact(req.params.username, req.auth.account.person.id)));
  router.post("/network/people/:username/actions", origin, limiter || rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }), noQuery, wrap(req => network.action(actor(req), req.params.username, req.body)));
  return router;
}
