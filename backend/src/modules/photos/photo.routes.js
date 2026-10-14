import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { parse } from "cookie";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";

export function draftCookie(nodeEnv) {
  return { name: nodeEnv === "production" ? "__Host-brightway_signup" : "brightway_signup",
    options: { httpOnly: true, secure: nodeEnv === "production", sameSite: "lax", path: "/" } };
}
export const readDraftToken = (req, name) => parse(req.headers.cookie ?? "")[name];

export function createPhotoRoutes({ photos, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const cookie = draftCookie(nodeEnv);
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 60 * 60 * 1000, limit: 20,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { success: false, message: "Too many photo requests. Please retry later." } });
  let inFlight = 0;
  function slot(req, res, next) {
    if (inFlight >= 2) return res.status(503).json({ success: false, message: "Photo uploads are busy. Please retry." });
    inFlight++;
    let released = false;
    const release = () => { if (!released) { released = true; inFlight--; } };
    req.brightwayPhotoRelease = release;
    res.once("finish", release);
    // A disconnected caller must not free capacity while its upload is still running.
    res.once("close", () => { if (!req.brightwayPhotoActive) release(); });
    next();
  }
  function mime(req, res, next) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.get("Content-Type"))) {
      return res.status(415).json({ success: false, message: "Upload JPEG, PNG or WebP image bytes." });
    }
    next();
  }
  const bytes = raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb", inflate: false });
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  router.post("/auth/signup-drafts", origin, limits, async (req, res, next) => {
    try {
      const draft = await photos.begin(readDraftToken(req, cookie.name));
      res.cookie(cookie.name, draft.token, { ...cookie.options, expires: draft.expiresAt });
      res.status(201).json({ success: true, data: { expiresAt: draft.expiresAt } });
    } catch (error) { next(error); }
  });
  router.post("/auth/signup-drafts/photo", origin, limits, mime, slot, bytes, async (req, res, next) => {
    req.brightwayPhotoActive = true;
    try {
      const photo = await photos.uploadDraft(readDraftToken(req, cookie.name), req.body, req.get("Content-Type"));
      res.status(201).json({ success: true, data: photo });
    } catch (error) { next(error); }
    finally { req.brightwayPhotoRelease(); }
  });
  router.post("/profile/me/photo", origin, limits, auth, (req, res, next) => {
    const value = req.get("X-Profile-Version");
    if (!/^\d+$/.test(value ?? "") || Number(value) > 2147483646) {
      return res.status(400).json({ success: false, message: "Send the current X-Profile-Version header." });
    }
    next();
  }, mime, slot, bytes, async (req, res, next) => {
    req.brightwayPhotoActive = true;
    try {
      const photo = await photos.uploadOwner(req.auth.account.person.id, Number(req.get("X-Profile-Version")), req.body, req.get("Content-Type"));
      res.status(201).json({ success: true, data: photo });
    } catch (error) { next(error); }
    finally { req.brightwayPhotoRelease(); }
  });
  router.get("/photos/:id", auth, async (req, res, next) => {
    try {
      const photo = await photos.readOwner(req.auth.account.person.id, req.params.id);
      res.type("image/webp").send(photo);
    } catch (error) { next(error); }
  });
  return router;
}