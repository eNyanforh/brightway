import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { verifyPersonaSignature } from "./persona.webhook.js";
const empty = z.strictObject({});
const restart = z.strictObject({ expectedAttemptId: z.uuid() });
export function createIdentityRoutes({ identity, sessions, clientUrl, nodeEnv, limiter,
  webhookSecret = process.env.PERSONA_WEBHOOK_SECRET, now = () => new Date() }) {
  const router = Router(), cookie = createSessionCookieConfig(nodeEnv);
  router.use("/identity", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.post("/identity/persona/webhook", async (req, res, next) => {
    try {
      verifyPersonaSignature(req.rawBody, req.get("Persona-Signature"), webhookSecret, now());
      await identity.webhook(req.body);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
  router.use("/identity", createRequireAuth({ sessions, cookieName: cookie.name }));
  router.get("/identity", async (req, res, next) => {
    try { res.json({ success: true, data: await identity.read(req.auth.account.id) }); } catch (error) { next(error); }
  });
  router.use("/identity", requireTrustedOrigin(clientUrl), limiter ?? rateLimit({ windowMs: 60000, limit: 12,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { success: false, message: "Too many identity requests. Please wait a minute." } }));
  const action = (schema, fn) => async (req, res, next) => {
    const input = schema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, message: "Invalid identity request." });
    try { res.json({ success: true, data: await fn(req.auth.account.id, input.data) }); } catch (error) { next(error); }
  };
  router.post("/identity/start", action(empty, (id) => identity.start(id)));
  router.post("/identity/restart", action(restart, (id, input) => identity.start(id, input.expectedAttemptId)));
  router.post("/identity/refresh", action(empty, (id) => identity.refresh(id)));
  return router;
}
