import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireTrustedOrigin } from "../auth/session.http.js";
const fail = (status, message) => Object.assign(Error(message), { status });
export function managementCookies(nodeEnv) {
  const production = nodeEnv === "production";
  return { session: production ? "__Host-brightway-management" : "brightway-management", pending: production ? "__Host-brightway-management-pending" : "brightway-management-pending", recovery: production ? "__Host-brightway-management-recovery" : "brightway-management-recovery", options: { httpOnly: true, secure: production, sameSite: "strict", path: "/" } };
}
export function cookieValue(req, name) {
  const values = (req.headers.cookie || "").split(";").map(value => value.trim()).filter(value => value.startsWith(name + "="));
  if (values.length !== 1) return null;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); } catch { return null; }
}
export function requireManagement(auth, nodeEnv) {
  const cookies = managementCookies(nodeEnv);
  return async (req, res, next) => {
    try { const token = cookieValue(req, cookies.session); if (!token) throw fail(401, "Sign in to BrightWay Management."); req.management = await auth.authenticate(token); next(); }
    catch (error) { next(error.status ? error : fail(503, "Management authentication is temporarily unavailable.")); }
  };
}
export function createManagementAuthRoutes({ authentication, clientUrl, nodeEnv, limiter }) {
  const router = Router(), cookies = managementCookies(nodeEnv), origin = requireTrustedOrigin(clientUrl);
  const limits = limiter || rateLimit({ windowMs: 900000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
  const auth = requireManagement(authentication, nodeEnv);
  const wrap = work => async (req, res, next) => { try { await work(req, res); } catch (error) { next(error.status ? error : fail(503, "Management authentication is temporarily unavailable.")); } };
  const reply = (res, data) => res.json({ success: true, data });
  router.use("/management/auth", (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); });
  router.post("/management/auth/login", origin, limits, wrap(async (req, res) => {
    const { challengeToken, ...result } = await authentication.login(req.body);
    await authentication.logout(cookieValue(req, cookies.session), cookieValue(req, cookies.pending), cookieValue(req, cookies.recovery));
    res.clearCookie(cookies.session, cookies.options);
    res.cookie(cookies.pending, challengeToken, { ...cookies.options, expires: result.expiresAt }); reply(res, result);
  }));
  router.post("/management/auth/verify", origin, limits, wrap(async (req, res) => {
    const { token, expiresAt, ...result } = await authentication.complete(cookieValue(req, cookies.pending), req.body);
    res.clearCookie(cookies.pending, cookies.options); res.cookie(cookies.session, token, { ...cookies.options, expires: expiresAt }); reply(res, result);
  }));
  router.get("/management/auth/me", auth, wrap(async (req, res) => reply(res, { staff: req.management.staff })));
  router.post("/management/auth/logout", origin, wrap(async (req, res) => {
    await authentication.logout(cookieValue(req, cookies.session), cookieValue(req, cookies.pending), cookieValue(req, cookies.recovery));
    for (const name of [cookies.session, cookies.pending, cookies.recovery]) res.clearCookie(name, cookies.options);
    reply(res, { loggedOut: true });
  }));
  router.post("/management/auth/recovery/request", origin, limits, wrap(async (req, res) => {
    if (Object.keys(req.body || {}).some(key => key !== "email")) throw fail(400, "Provide only the management email address.");
    const result = await authentication.requestRecovery(req.body?.email);
    // Always issue an opaque cookie, including unknown recipients. No enumeration proof.
    const { randomBytes } = await import("node:crypto");
    res.cookie(cookies.recovery, result.challengeToken || randomBytes(32).toString("hex"), { ...cookies.options, maxAge: 600000 }); reply(res, { accepted: true });
  }));
  router.post("/management/auth/recovery/reset", origin, limits, wrap(async (req, res) => {
    const result = await authentication.reset(cookieValue(req, cookies.recovery), req.body);
    res.clearCookie(cookies.recovery, cookies.options); res.clearCookie(cookies.session, cookies.options); reply(res, result);
  }));
  router.post("/management/security/step-up", origin, auth, limits, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store"); reply(res, await authentication.stepUp(req.management.staff.id, req.management.sessionId, req.body));
  }));
  router.post("/management/security/backups", origin, auth, limits, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store"); reply(res, await authentication.regenerate(req.management.staff.id, req.management.sessionId, req.body));
  }));
  router.post("/management/security/conflicts", origin, auth, limits, wrap(async (req, res) => {
    res.set("Cache-Control", "no-store"); reply(res, await authentication.declareConflict(req.management.staff.id, req.management.sessionId, req.body));
  }));
  return router;
}
