import { Router } from "express";
import { profilePatchSchema } from "./profile.schema.js";
import {
  createRequireAuth, createSessionCookieConfig, requireTrustedOrigin,
} from "../auth/session.http.js";

export function createProfileRoutes({ profiles, sessions, clientUrl, nodeEnv }) {
  const router = Router();
  const cookie = createSessionCookieConfig(nodeEnv);
  const auth = createRequireAuth({ sessions, cookieName: cookie.name });
  const origin = requireTrustedOrigin(clientUrl);

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/me", auth, async (req, res, next) => {
    try {
      const profile = await profiles.read(req.auth.account.person.id);
      res.json({ success: true, data: { profile } });
    } catch (error) { next(error); }
  });

  router.patch("/me", origin, auth, async (req, res, next) => {
    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false, message: "Please check your profile changes.",
        errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      });
    }
    try {
      const profile = await profiles.patch(req.auth.account.person.id, parsed.data);
      res.json({ success: true, message: "Profile draft saved.", data: { profile } });
    } catch (error) { next(error); }
  });

  router.get("/me/completion", auth, async (req, res, next) => {
    try {
      res.json({ success: true, data: await profiles.completion(req.auth.account.person.id) });
    } catch (error) { next(error); }
  });
  return router;
}

