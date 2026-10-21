import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { createRequireAuth, createSessionCookieConfig, readSessionToken, requireTrustedOrigin } from "./session.http.js";
const password = z.string().min(1).max(128), code = z.string().trim().min(6).max(27).regex(/^(?:\d{6}|[a-fA-F0-9-]{24,27})$/);
export function createMfaRoutes({ mfa, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), cookie = createSessionCookieConfig(nodeEnv), pending = nodeEnv === "production" ? "__Host-brightway_mfa" : "brightway_mfa";
  const auth = createRequireAuth({ sessions, cookieName: cookie.name });
  const limits = limiter ?? rateLimit({ windowMs: 900000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many two-factor requests. Please try again later." } });
  router.use("/mfa", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); }, limits);
  const run = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error.status ? error : Object.assign(new Error("Two-factor authentication is temporarily unavailable."), { status: 503 })); } };
  const body = (schema, fn) => run(async (req, res) => { const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Check your password and authentication code." }); await fn(req, res, parsed.data); });
  const json = (res, data) => res.json({ success: true, data });
  router.post("/mfa/verify-login", requireTrustedOrigin(clientUrl), body(z.strictObject({ code }), async (req, res, input) => {
    const result = await mfa.complete(readSessionToken(req, pending), input.code);
    res.clearCookie(pending, cookie.options); res.cookie(cookie.name, result.token, { ...cookie.options, expires: result.expiresAt });
    json(res, { account: result.account });
  }));
  router.post("/mfa/cancel-login", requireTrustedOrigin(clientUrl), run(async (req, res) => {
    await mfa.cancel(readSessionToken(req, pending)); res.clearCookie(pending, cookie.options); json(res, {});
  }));
  router.use("/mfa", auth);
  router.get("/mfa", run(async (req, res) => json(res, await mfa.status(req.auth.account.id, req.auth.sessionId))));
  router.post("/mfa/setup", requireTrustedOrigin(clientUrl), body(z.strictObject({ password }), async (req, res, input) => json(res, await mfa.begin(req.auth.account.id, input.password))));
  router.post("/mfa/enable", requireTrustedOrigin(clientUrl), body(z.strictObject({ code: z.string().regex(/^\d{6}$/) }), async (req, res, input) => json(res, await mfa.enable(req.auth.account.id, req.auth.sessionId, input.code))));
  router.post("/mfa/backup-codes", requireTrustedOrigin(clientUrl), body(z.strictObject({ password, code: code.optional() }), async (req, res, input) => json(res, await mfa.change(req.auth.account.id, req.auth.sessionId, input))));
  router.post("/mfa/disable", requireTrustedOrigin(clientUrl), body(z.strictObject({ password, code }), async (req, res, input) => json(res, await mfa.change(req.auth.account.id, req.auth.sessionId, input, true))));
  return router;
}
