import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "./session.http.js";

const requestSchema = z.strictObject({});
const verifySchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
export function createAccountEmailRoutes({ verification, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 60 * 60 * 1000, limit: 30,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { success: false, message: "Too many email verification requests. Please try again later." } });
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  for (const [path, schema, action] of [["/email/request", requestSchema, "request"], ["/email/verify", verifySchema, "verify"]]) {
    router.post(path, origin, limits, auth, async (req, res, next) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Please check your verification code." });
      try {
        const data = await verification[action](req.auth.account.person.id, parsed.data.code);
        res.json({ success: true, data });
      } catch (error) { next(error); }
    });
  }
  return router;
}
