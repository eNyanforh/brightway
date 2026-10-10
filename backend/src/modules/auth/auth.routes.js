import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { registrationSchema } from "./registration.schema.js";

export function createAuthRoutes({ register, limiter }) {
  const router = Router();
  const registrationLimiter = limiter ?? rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many registration attempts. Please try again later.",
    },
  });

  router.post("/register", registrationLimiter, async (req, res, next) => {
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
      const account = await register(result.data);
      return res.status(201).json({
        success: true,
        message: "BrightWay account created successfully.",
        data: { account },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
