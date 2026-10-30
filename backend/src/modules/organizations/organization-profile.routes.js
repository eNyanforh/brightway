import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
export function createOrganizationProfileRoutes({ profiles, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router(), auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name }), origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 3600000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => req.auth.account.id });
  const handle = fn => async (req, res, next) => { try { res.json({ success: true, data: await fn(req, req.auth.account.id, req.auth.sessionId) }); } catch (error) { next(error.status ? error : Object.assign(Error("Organization profile is temporarily unavailable."), { status: 503 })); } };
  router.get("/organizations/:id/photo/:photoId", async (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    try { res.type("image/webp").send(await profiles.readPhoto(req.params.id, req.params.photoId)); } catch (error) { next(error.status ? error : Object.assign(Error("Organization photo is temporarily unavailable."), { status: 503 })); }
  });
  router.use("/organization-workspace/:orgId/profile", (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); }, auth);
  router.get("/organization-workspace/:orgId/profile", handle((r, a, s) => profiles.read(a, s, r.params.orgId)));
  router.put("/organization-workspace/:orgId/profile", origin, limits, handle((r, a, s) => profiles.saveUsername(a, s, r.params.orgId, r.body)));
  router.patch("/organization-workspace/:orgId/profile", origin, limits, handle((r, a, s) => profiles.saveContact(a, s, r.params.orgId, r.body)));
  let inFlight = 0;
  router.post("/organization-workspace/:orgId/profile/photo", origin, limits, (req, res, next) => {
    if (!/^(0|[1-9]\d*)$/.test(req.get("X-Organization-Profile-Version") || "") || Number(req.get("X-Organization-Profile-Version")) > 2147483646) return res.status(400).json({ success: false, message: "Send the current X-Organization-Profile-Version header." });
    if (!["image/jpeg", "image/png", "image/webp"].includes(req.get("Content-Type"))) return res.status(415).json({ success: false, message: "Choose a JPEG, PNG or WebP profile picture." });
    if (inFlight >= 2) return res.status(503).json({ success: false, message: "Organization uploads are busy. Please retry." });
    inFlight++; let released = false;
    req.releaseOrganizationUpload = () => { if (!released) { released = true; inFlight--; } };
    res.once("finish", req.releaseOrganizationUpload);
    res.once("close", () => { if (!req.organizationUploadActive) req.releaseOrganizationUpload(); });
    next();
  }, raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb", inflate: false }), async (req, res, next) => {
    req.organizationUploadActive = true;
    try { res.status(201).json({ success: true, data: await profiles.uploadPhoto(req.auth.account.id, req.auth.sessionId, req.params.orgId, Number(req.get("X-Organization-Profile-Version")), req.body, req.get("Content-Type")) }); }
    catch (error) { next(error.status ? error : Object.assign(Error("Organization photo upload is temporarily unavailable."), { status: 503 })); }
    finally { req.releaseOrganizationUpload(); }
  });
  return router;
}
