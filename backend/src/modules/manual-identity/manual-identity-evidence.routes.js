import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { IDENTITY_IMAGE_TYPES } from "./manual-identity.image.js";
import { MANUAL_IDENTITY_CONSENT } from "./manual-identity-evidence.service.js";

export function createManualIdentityEvidenceRoutes({ evidence, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 3600000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false });
  const handle = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (error) {
      next(error.status >= 400 && error.status <= 599 ? error : Object.assign(Error("Identity document storage is temporarily unavailable."), { status: 503 }));
    }
  };
  const base = "/manual-identity/evidence";
  router.use(base, (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next();
  }, auth);
  let uploads = 0;
  function slot(req, res, next) {
    if (uploads >= 2) return res.status(503).json({ success: false, message: "Identity uploads are busy. Please retry." });
    uploads++;
    let released = false;
    req.releaseIdentityUpload = () => { if (!released) { released = true; uploads--; } };
    res.once("finish", req.releaseIdentityUpload);
    res.once("close", () => { if (!req.processingIdentityUpload) req.releaseIdentityUpload(); });
    next();
  }
  router.get(base, handle(async (req, res) => res.json({ success: true, data: await evidence.list(req.auth.account.id) })));
  router.post(`${base}/:kind`, origin, limits, (req, res, next) => {
    if (!["GOVERNMENT_ID", "SELFIE"].includes(req.params.kind) ||
        !IDENTITY_IMAGE_TYPES.includes(req.get("Content-Type")) || req.get("X-Identity-Consent") !== MANUAL_IDENTITY_CONSENT ||
        Object.keys(req.query).length) {
      return res.status(400).json({ success: false, message: "Send an ID or selfie image and acknowledge the identity upload notice." });
    }
    next();
  }, slot, raw({ type: IDENTITY_IMAGE_TYPES, limit: "5mb", inflate: false }), handle(async (req, res) => {
    req.processingIdentityUpload = true;
    try {
      const data = await evidence.upload(req.auth.account.id, req.params.kind, req.body, req.get("Content-Type"), req.get("X-Identity-Consent"));
      res.status(201).json({ success: true, data });
    } finally { req.releaseIdentityUpload(); }
  }));
  router.get(`${base}/:id/download`, limits, handle(async (req, res) => {
    const result = await evidence.read(req.auth.account.id, req.params.id);
    res.set({ "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="identity-image.webp"',
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" }).send(result.bytes);
  }));
  router.delete(`${base}/:id`, origin, limits, handle(async (req, res) => res.json({ success: true, data: await evidence.remove(req.auth.account.id, req.params.id) })));
  return router;
}
