import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireTrustedOrigin, createSessionCookieConfig } from "./session.http.js";
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const resetRequestSchema = z.strictObject({ email });
export const resetConfirmSchema = z.strictObject({ email, code: z.string().regex(/^\d{6}$/), password: z.string().min(15).max(128) });
export function createPasswordResetRoutes({ recovery, clientUrl, nodeEnv, limiter }) {
  const router = Router(), cookie = createSessionCookieConfig(nodeEnv);
  router.use("/password-reset", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); }, requireTrustedOrigin(clientUrl), limiter ?? rateLimit({ windowMs: 900000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many recovery requests. Please try again later." } }));
  const run = (schema, fn) => async (req, res, next) => {
    const input = schema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, message: "Check your email, six-digit code and password (15–128 characters)." });
    try { await fn(input.data, res); }
    catch (error) { next(error.status ? error : Object.assign(new Error("Password recovery is temporarily unavailable. Please try again."), { status: 503 })); }
  };
  router.post("/password-reset/request", run(resetRequestSchema, async (input, res) => {
    const result = await recovery.request(input.email);
    res.json({ success: true, data: result.acknowledgement });
    void result.deliver().catch(() => {});
  }));
  router.post("/password-reset/confirm", run(resetConfirmSchema, async (input, res) => {
    const data = await recovery.confirm(input);
    res.clearCookie(cookie.name, cookie.options);
    res.json({ success: true, data });
  }));
  return router;
}
