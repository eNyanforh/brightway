import { historySchema } from "./profile-history.schema.js";
import { Router } from "express";
import { profilePatchSchema } from "./profile.schema.js";
import {
  createRequireAuth, createSessionCookieConfig, requireTrustedOrigin, readSessionToken,
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
  for (const kind of ["education", "experience"]) {
    router.put(`/me/${kind}`, origin, auth, async (req, res, next) => {
      const parsed = historySchema(kind).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({
        success: false, message: "Please check your profile records.",
        errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      });
      try {
        const profile = await profiles.saveHistory(req.auth.account.person.id, kind, parsed.data);
        res.json({ success: true, data: { profile } });
      } catch (error) { next(error); }
    });
  }
  router.get("/:username/contact", async (req, res, next) => {
    try {
      const username = req.params.username.toLowerCase();
      if (!/^[a-z0-9_]{3,30}$/.test(username)) return res.status(404).json({ success: false, message: "Profile not found." });
      const token = readSessionToken(req, cookie.name);
      const viewer = token ? await sessions.authenticate(token) : null;
      const contact = await profiles.visibleContact(username, viewer?.account.person.id ?? null);
      res.json({ success: true, data: { contact } });
    } catch (error) { next(error); }
  });
  return router;
}