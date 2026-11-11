import { Router, raw } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { requireManagement } from "../management/management-auth.http.js";
import { fail } from "../network/network.schema.js";
import { parse, id } from "./messaging.schema.js";

export function createMessagingRoutes({ messaging, notifications, sessions, authentication, clientUrl, nodeEnv, limiter, pollIntervalMs = 3000 }) {
  const router = Router(), origin = requireTrustedOrigin(clientUrl);
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const privateHeaders = (_req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };
  const owner = req => req.management ? { staffId: req.management.staff.id, sessionId: req.management.sessionId } : { accountId: req.auth.account.id, sessionId: req.auth.sessionId };
  const limits = limiter || rateLimit({ windowMs: 60000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => owner(req).accountId || owner(req).staffId });
  const reply = work => async (req, res, next) => { try { res.json({ success: true, data: await work(req, owner(req)) }); } catch (e) { next(e.status ? e : fail(503, "Messaging is temporarily unavailable. Retry with the same message key.")); } };
  const noQuery = (req, _res, next) => Object.keys(req.query).length ? next(fail(400, "This action accepts no query fields.")) : next();
  router.use("/messaging", privateHeaders, auth, limits);
  router.get("/messaging/conversations", reply((r, a) => messaging.list(a, r.query)));
  router.post("/messaging/conversations", origin, noQuery, reply((r, a) => { const data = parse(z.strictObject({ username: z.string() }), r.body); return messaging.open(a, data.username); }));
  router.get("/messaging/shared-content", reply((r, a) => messaging.resolveShare(a, r.query)));
  router.get("/messaging/preferences", noQuery, reply((_r, a) => messaging.preferences(a)));
  router.put("/messaging/preferences", origin, noQuery, reply((r, a) => messaging.preferences(a, r.body)));
  router.post("/messaging/heartbeat", origin, noQuery, reply((r, a) => { parse(z.strictObject({}), r.body); return messaging.heartbeat(a); }));
  router.get("/messaging/conversations/:id", reply((r, a) => messaging.detail(a, r.params.id, r.query)));
  router.post("/messaging/conversations/:id/messages", origin, noQuery, reply((r, a) => messaging.send(a, r.params.id, r.body)));
  router.post("/messaging/conversations/:id/receipts", origin, noQuery, reply((r, a) => messaging.receipts(a, r.params.id, r.body)));
  router.post("/messaging/conversations/:id/typing", origin, noQuery, reply((r, a) => messaging.typing(a, r.params.id, r.body)));
  const uploads = rateLimit({ windowMs: 60000, limit: 6, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: req => owner(req).accountId });
  router.delete("/messaging/conversations/:id/files/:fileId", origin, noQuery, reply((r, a) => messaging.discardFile(a, r.params.id, r.params.fileId)));
  router.post("/messaging/conversations/:id/files", origin, uploads, raw({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp"], limit: "5mb" }), reply((r, a) => messaging.upload(a, r.params.id, r.query, r.body, r.get("Content-Type"))));
  const download = async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw fail(400, "Invalid file query.");
      const f = await messaging.file(owner(req), req.params.id, req.params.fileId);
      res.set({ "Content-Type": f.contentType, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Content-Disposition": `attachment; filename="message-file.${f.contentType === "application/pdf" ? "pdf" : "webp"}"` }).send(f.bytes);
    } catch (e) { next(e.status ? e : fail(503, "This private attachment is temporarily unavailable.")); }
  };
  router.get("/messaging/conversations/:id/files/:fileId", download);
  const streams = new Map();
  const stream = async (req, res, next) => {
    let q, previous;
    const actor = owner(req), key = actor.accountId || actor.staffId;
    try {
      q = parse(z.strictObject({ conversationId: id.optional(), organizationId: id.optional() }), req.query);
      if ((streams.get(key) || 0) >= 4) throw fail(429, "Too many live messaging tabs are open.");
      previous = await messaging.snapshot(actor, q);
    } catch (e) { return next(e.status ? e : fail(503, "Live updates are temporarily unavailable.")); }
    streams.set(key, (streams.get(key) || 0) + 1);
    res.set({ "Content-Type": "text/event-stream", "Connection": "keep-alive", "X-Accel-Buffering": "no" }); res.flushHeaders();
    const emit = (name, data = {}) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    emit("sync");
    let closed = false, timer, pending = false, ticks = 0, notificationHash;
    const finish = () => { if (closed) return; closed = true; clearInterval(timer); streams.set(key, Math.max(0, (streams.get(key) || 1) - 1)); res.end(); };
    req.on("close", finish);
    timer = setInterval(async () => {
      if (pending || closed) return;
      pending = true;
      try {
        const current = await messaging.snapshot(actor, q);
        if (closed) return;
        if (current.messages !== previous.messages) emit("message:new");
        if (current.delivered !== previous.delivered) emit("message:delivered");
        if (current.read !== previous.read) { emit("message:read"); emit("conversation:read"); }
        if (JSON.stringify(current.presence) !== JSON.stringify(previous.presence)) {
          emit("presence:update", current.presence || {});
          if (current.presence?.typing !== previous.presence?.typing) emit(current.presence?.typing ? "typing:start" : "typing:stop");
        }
        if (!actor.staffId && !q.organizationId && ticks % 5 === 0) {
          const inbox = await notifications.list(actor);
          const hash = JSON.stringify(inbox.items.map(n => [n.id, n.readAt]));
          if (notificationHash !== undefined && hash !== notificationHash) { emit("notification:new"); emit("notification:read"); }
          notificationHash = hash;
        }
        previous = current; ticks++; res.write(": keepalive\n\n");
        if (ticks >= 500) finish();
      } catch { if (!closed) { emit("access:changed"); finish(); } }
      finally { pending = false; }
    }, pollIntervalMs);
  };
  router.get("/messaging/events", stream);
  if (authentication) {
    router.use("/management/official-messages", privateHeaders, requireManagement(authentication, nodeEnv), limits);
    router.get("/management/official-messages", reply((r, a) => messaging.list(a, r.query)));
    router.post("/management/official-messages", origin, noQuery, reply((r, a) => messaging.official(a, r.body)));
    router.get("/management/official-messages/recipients", reply((r, a) => messaging.recipients(a, r.query)));
    router.get("/management/official-messages/events", stream);
    router.get("/management/official-messages/:id", reply((r, a) => messaging.detail(a, r.params.id, r.query)));
    router.post("/management/official-messages/:id/receipts", origin, noQuery, reply((r, a) => messaging.receipts(a, r.params.id, r.body)));
    router.get("/management/official-messages/:id/files/:fileId", download);
  }
  return router;
}
