import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { registrationSchema } from "./registration.schema.js";
import { requireTrustedOrigin } from "./session.http.js";
import { draftCookie, readDraftToken } from "../photos/photo.routes.js";

export function createAuthRoutes({ register, limiter, clientUrl, nodeEnv }) {
  const router = Router();
  const cookie = draftCookie(nodeEnv);

  const registrationLimiter =
    limiter ??
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,

      message: {
        success: false,
        message:
          "Too many registration attempts. Please try again later.",
      },
    });

  router.post(
    "/register",
    requireTrustedOrigin(clientUrl),
    registrationLimiter,
    async (req, res, next) => {
      const result = registrationSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Please check your registration details.",

          errors: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      try {
        const account = await register(result.data, readDraftToken(req, cookie.name));
        res.clearCookie(cookie.name, cookie.options);
        res.set("Cache-Control", "no-store");

        return res.status(201).json({
          success: true,
          message: "BrightWay account created successfully.",

          data: {
            account,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}