import { issuerSearchSchema } from "./credential-issuer.js";
import { requireMfa } from "../auth/mfa.service.js";
import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { kindSchema, submitSchema, assignSchema, decisionSchema, reviewQueueQuerySchema } from "./credential.schema.js";
export function createCredentialRoutes({ credentials, sessions, clientUrl, nodeEnv, limiter }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const origin = requireTrustedOrigin(clientUrl);
  const limits = limiter ?? rateLimit({ windowMs: 3600000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many credential requests. Try again later." } });
  router.use(["/credentials", "/admin/credentials"], (req, res, next) => { res.set("Cache-Control", "no-store"); next(); }, auth);
  router.use("/admin/credentials", requireMfa);
  const actor = (req) => req.auth.account.id;
  const person = (req) => req.auth.account.person.id;
  function subject(req, res, next) {
    if (!kindSchema.safeParse(req.params.kind).success || !z.uuid().safeParse(req.params.recordId).success) return res.status(404).json({ success: false, message: "Credential record not found." });
    next();
  }
  const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error : Object.assign(new Error("Credential review is temporarily unavailable. Please retry."), { status: 503 })); } };
  const json = (res, data) => res.json({ success: true, data });
  function body(schema) {
    return (req, res, next) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: "Please check your review information.", errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
      req.reviewInput = parsed.data; next();
    };
  }
  let uploads = 0;
  function slot(req, res, next) {
    if (uploads >= 2) return res.status(503).json({ success: false, message: "Evidence uploads are busy. Please retry." });
    uploads++;
    let released = false;
    req.releaseEvidence = () => { if (!released) { released = true; uploads--; } };
    res.once("finish", req.releaseEvidence);
    res.once("close", () => { if (!req.processingEvidence) req.releaseEvidence(); });
    next();
  }
  router.get("/credentials/issuers", handle(async (req, res) => {
    const parsed = issuerSearchSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Choose a credential type and search using 2–100 characters." });
    json(res, await credentials.issuers(parsed.data.kind, parsed.data.query));
  }));
  const orgReview = "/organization-workspace/:organizationId/credential-reviews";
  router.use(orgReview, (req, res, next) => { res.set("Cache-Control", "no-store"); next(); }, auth, requireMfa, (req, res, next) => {
    if (!z.uuid().safeParse(req.params.organizationId).success) return res.status(404).json({ success: false, message: "Organization not found." });
    next();
  });
  router.get(orgReview, handle(async (req, res) => {
    const paging = reviewQueueQuerySchema.safeParse(req.query);
    if (!paging.success) return res.status(400).json({ success: false, message: "Invalid queue page." });
    json(res, await credentials.queue(actor(req), paging.data.cursor, req.auth.sessionId, req.params.organizationId, paging.data));
  }));
  const reviewId = (req, res, next) => { if (!z.uuid().safeParse(req.params.id).success) return res.status(404).json({ success: false, message: "Review not found." }); next(); };
  router.get(orgReview + "/:id", reviewId, handle(async (req, res) => json(res, await credentials.detail(actor(req), req.params.id, req.auth.sessionId, req.params.organizationId))));
  router.post(orgReview + "/:id/assign", reviewId, origin, limits, body(assignSchema), handle(async (req, res) => json(res, await credentials.transition(actor(req), req.params.id, req.reviewInput, true, req.auth.sessionId, req.params.organizationId))));
  router.post(orgReview + "/:id/decision", reviewId, origin, limits, body(decisionSchema), handle(async (req, res) => json(res, await credentials.transition(actor(req), req.params.id, req.reviewInput, false, req.auth.sessionId, req.params.organizationId))));
  router.get("/credentials", handle(async (req, res) => {
    const cursor = req.query.cursor;
    if (cursor !== undefined && !z.uuid().safeParse(cursor).success) return res.status(400).json({ success: false, message: "Invalid review cursor." });
    json(res, await credentials.ownerReviews(person(req), cursor));
  }));
  router.get("/credentials/:kind/:recordId", subject, handle(async (req, res) => json(res, await credentials.owner(person(req), req.params.kind, req.params.recordId))));
  router.post("/credentials/:kind/:recordId/evidence", origin, limits, subject, (req, res, next) => {
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(req.get("Content-Type")) || !/^[1-9]\d{0,9}$/.test(req.get("X-Record-Revision") ?? "") || Number(req.get("X-Record-Revision")) > 2147483646) {
      return res.status(400).json({ success: false, message: "Send an image or PDF and the saved X-Record-Revision." });
    }
    next();
  }, slot, raw({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp"], limit: "5mb", inflate: false }), handle(async (req, res) => {
    req.processingEvidence = true;
    try { res.status(201); json(res, await credentials.upload(person(req), req.params.kind, req.params.recordId, Number(req.get("X-Record-Revision")), req.body, req.get("Content-Type"))); }
    finally { req.releaseEvidence(); }
  }));
  router.post("/credentials/:kind/:recordId/submit", origin, limits, subject, body(submitSchema), handle(async (req, res) => json(res, await credentials.submit(person(req), actor(req), req.params.kind, req.params.recordId, req.reviewInput))));
  router.get("/credentials/evidence/:id/download", handle(async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) return res.status(404).json({ success: false, message: "Evidence not found." });
    if (!(await credentials.ownsEvidence(person(req), req.params.id)) && (req.auth.mfaVerified !== true || !req.auth.sessionId)) return res.status(403).json({ success: false, message: "Two-factor authentication is required for reviewer evidence downloads." });
    const result = await credentials.readEvidence(actor(req), person(req), req.params.id, req.auth.sessionId);
    res.set({ "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="supporting-document.${result.contentType === "application/pdf" ? "pdf" : "webp"}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" }).send(result.bytes);
  }));
  router.get("/admin/credentials/access", handle(async (req, res) => json(res, await credentials.access(actor(req), req.auth.sessionId))));
  router.get("/admin/credentials", handle(async (req, res) => {
    const cursor = req.query.cursor;
    if (cursor !== undefined && !z.uuid().safeParse(cursor).success) return res.status(400).json({ success: false, message: "Invalid queue cursor." });
    json(res, await credentials.queue(actor(req), cursor, req.auth.sessionId));
  }));
  router.get("/admin/credentials/:id", handle(async (req, res) => json(res, await credentials.detail(actor(req), req.params.id, req.auth.sessionId))));
  router.post("/admin/credentials/:id/assign", origin, limits, body(assignSchema), handle(async (req, res) => json(res, await credentials.transition(actor(req), req.params.id, req.reviewInput, true, req.auth.sessionId))));
  router.post("/admin/credentials/:id/decision", origin, limits, body(decisionSchema), handle(async (req, res) => json(res, await credentials.transition(actor(req), req.params.id, req.reviewInput, false, req.auth.sessionId))));
  return router;
}

