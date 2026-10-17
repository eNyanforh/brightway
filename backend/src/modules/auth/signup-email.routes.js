import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireTrustedOrigin } from "./session.http.js";
import { draftCookie, readDraftToken } from "../photos/photo.routes.js";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const requestSchema = z.strictObject({ email });
const verifySchema = z.strictObject({ email, code: z.string().regex(/^\d{6}$/, "Enter the six-digit code from your email.") });
export function createSignupEmailRoutes({ verification, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const cookieName = draftCookie(nodeEnv).name;
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 60 * 60 * 1000, limit: 30,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { success: false, message: "Too many email verification requests. Please try again later." } });
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  for (const [path, schema, action] of [["/signup-email/request", requestSchema, "request"], ["/signup-email/verify", verifySchema, "verify"]]) {
    router.post(path, origin, limits, async (req, res, next) => {
      const result = schema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ success: false, message: "Please check your email and verification code." });
      try {
        const { email, code } = result.data;
        const data = await verification[action](readDraftToken(req, cookieName), email, code);
        res.json({ success: true, data });
      } catch (error) { next(error); }
    });
  }
  return router;
}
