import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createOrganizationPostRoutes({ posts, photos, media, sessions, clientUrl, nodeEnv }) {
  const router = Router();
  const auth = createRequireAuth({ sessions, cookieName: createSessionCookieConfig(nodeEnv).name });
  const trustedOrigin = requireTrustedOrigin(clientUrl);
  const access = [(_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  }, auth];
  const writes = rateLimit({
    windowMs: 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: req => req.auth.account.id,
    message: { success: false, message: "Too many post requests. Try again shortly." },
  });
  const respond = (operation, status = 200) => async (req, res, next) => {
    try {
      const actor = { accountId: req.auth.account.id, sessionId: req.auth.sessionId };
      res.status(status).json({ success: true, data: await operation(req, actor) });
    } catch (error) {
      next(error.status ? error : fail(503, "Posts are temporarily unavailable."));
    }
  };
  const path = "/organization-workspace/:organizationId/posts";
  router.get("/explore/members/:username/photo/:photoId", access, async (req, res, next) => {
    try {
      const actor = { accountId: req.auth.account.id, sessionId: req.auth.sessionId };
      const target = await posts.memberPhoto(actor, req.params.username, req.params.photoId);
      const image = await photos.readOwner(target.personId, target.photoId);
      res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      res.type("image/webp").send(image);
    } catch (error) {
      next(error.status ? error : fail(503, "Profile photo is temporarily unavailable."));
    }
  });
  // Media bytes never pass through the JSON parser or a public bucket URL.
  // Raw request bodies have strict MIME, size and per-account rate limits.
  if (media) {
    const uploads = rateLimit({
      windowMs: 60000, limit: 6, standardHeaders: "draft-8", legacyHeaders: false,
      keyGenerator: req => req.auth.account.id,
      message: { success: false, message: "Too many media uploads. Try again shortly." },
    });
    router.post("/posts/me/media", access, trustedOrigin, uploads,
      raw({ type: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "application/pdf"],
        limit: "25mb", inflate: false }),
      respond((req, actor) => media.upload(actor, req.query, req.body, req.get("Content-Type")), 201));
    router.delete("/posts/me/media/:mediaId", access, trustedOrigin, writes,
      respond((req, actor) => media.discard(actor, req.params.mediaId)));
    router.get("/posts/media/:mediaId", access, async (req, res, next) => {
      const actor = { accountId: req.auth.account.id, sessionId: req.auth.sessionId };
      try {
        if (Object.keys(req.query).length) throw fail(400, "Invalid media query.");
        const item = await media.read(actor, req.params.mediaId, posts, req.get("Range") || "");
        res.set({
          "Content-Type": item.contentType,
          "Content-Length": String(item.bytes.length),
          "Accept-Ranges": "bytes",
          "X-Content-Type-Options": "nosniff",
          // These objects remain private but can be displayed by BrightWay's
          // separately-hosted web app when CLIENT_URL is a different origin.
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Referrer-Policy": "no-referrer",
          "Cache-Control": "private, no-store",
          "Content-Disposition": `inline; filename="${item.name.replace(/["\\]/g, "_")}"`,
          ...(item.partial ? { "Content-Range": `bytes ${item.start}-${item.end}/${item.size}` } : {}),
        });
        if (item.contentType === "application/pdf") {
          // Helmet's global SAMEORIGIN frame policy would block the native
          // PDF document viewer when the frontend and API use different hosts.
          const clientOrigin = new URL(clientUrl).origin;
          res.removeHeader("X-Frame-Options");
          res.setHeader("Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'self' " + clientOrigin);
        }
        res.status(item.partial ? 206 : 200).send(item.bytes);
      } catch (error) { next(error.status ? error : fail(503, "This media file is temporarily unavailable.")); }
    });
  }
  router.get("/explore/posts", access, respond((req, actor) => posts.feed(actor, req.query)));
  router.get("/explore/posts/:source/:id", access,
    respond((req, actor) => posts.readPost(actor, req.params.source, req.params.id)));
  router.get("/explore/posts/member/:id/engagers", access,
    respond((req, actor) => posts.engagementPreview(actor, req.params.id)));
  router.put("/explore/posts/:source/:id/like", access, trustedOrigin, writes, respond((req, actor) => posts.setLike(actor, req.params.source, req.params.id, req.body)));
  router.put("/explore/posts/:source/:id/save", access, trustedOrigin, writes, respond((req, actor) => posts.setSaved(actor, req.params.source, req.params.id, req.body)));
  router.put("/explore/posts/:source/:id/repost", access, trustedOrigin, writes, respond((req, actor) => posts.setReposted(actor, req.params.source, req.params.id, req.body)));
  router.put("/explore/posts/member/:id/register", access, trustedOrigin, writes,
    respond((req, actor) => posts.registerEvent(actor, req.params.id, req.body)));
  router.get("/explore/posts/member/:id/registration-requests", access,
    respond((req, actor) => posts.eventRequests(actor, req.params.id)));
  router.put("/explore/posts/member/:id/registration-requests/:requestId", access, trustedOrigin, writes,
    respond((req, actor) => posts.decideEventRequest(actor, req.params.id, req.params.requestId, req.body)));
  router.put("/explore/posts/:source/:id/view", access, trustedOrigin, writes,
    respond((req, actor) => posts.recordView(actor, req.params.source, req.params.id)));
  router.post("/explore/posts/:source/:id/report", access, trustedOrigin, writes,
    respond((req, actor) => posts.reportPost(actor, req.params.source, req.params.id, req.body), 201));

  const answers = "/explore/posts/member/:id/answers";
  router.get(answers, access, respond((req, actor) => posts.answers(actor, req.params.id, req.query)));
  router.post(answers, access, trustedOrigin, writes,
    respond((req, actor) => posts.addAnswer(actor, req.params.id, req.body), 201));
  router.put("/explore/answers/:answerId/vote", access, trustedOrigin, writes,
    respond((req, actor) => posts.voteAnswer(actor, req.params.answerId, req.body)));
  router.delete("/explore/answers/:answerId", access, trustedOrigin, writes,
    respond((req, actor) => posts.deleteAnswer(actor, req.params.answerId)));
  router.get("/explore/answers/:answerId/comments", access,
    respond((req, actor) => posts.answerComments(actor, req.params.answerId)));
  router.post("/explore/answers/:answerId/comments", access, trustedOrigin, writes,
    respond((req, actor) => posts.addAnswerComment(actor, req.params.answerId, req.body), 201));
  router.delete("/explore/answers/:answerId/comments/:commentId", access, trustedOrigin, writes,
    respond((req, actor) => posts.deleteAnswerComment(actor, req.params.answerId, req.params.commentId)));
  const comments = "/explore/posts/:source/:id/comments";
  router.get(comments, access, respond((req, actor) => posts.comments(actor, req.params.source, req.params.id, req.query)));
  router.post(comments, access, trustedOrigin, writes, respond((req, actor) => posts.addComment(actor, req.params.source, req.params.id, req.body), 201));
  router.delete(comments + "/:commentId", access, trustedOrigin, writes, respond((req, actor) => posts.deleteComment(actor, req.params.source, req.params.id, req.params.commentId)));
  router.get("/posts/members/:username/activity", access, respond((req, actor) => posts.memberActivity(actor, req.params.username, req.query)));
  router.get("/posts/me/activity", access, respond((req, actor) => posts.memberActivity(actor, null, req.query)));
  router.get("/posts/members/:username", access, respond((req, actor) => posts.publicMemberList(actor, req.params.username, req.query)));
  router.get("/posts/me", access, respond((req, actor) => posts.memberList(actor, req.query)));
  router.post("/posts/me", access, trustedOrigin, writes, respond((req, actor) => posts.memberPublish(actor, req.body), 201));
  router.patch("/posts/me/:id", access, trustedOrigin, writes, respond((req, actor) => posts.memberEdit(actor, req.params.id, req.body)));
  router.delete("/posts/me/:id", access, trustedOrigin, writes, respond((req, actor) => posts.memberWithdraw(actor, req.params.id)));
  router.get(path, access, respond((req, actor) => posts.list(actor, req.params.organizationId, req.query)));
  router.post(path, access, trustedOrigin, writes, respond((req, actor) => posts.publish(actor, req.params.organizationId, req.body), 201));
  router.patch(path + "/:id", access, trustedOrigin, writes, respond((req, actor) => posts.edit(actor, req.params.organizationId, req.params.id, req.body)));
  router.delete(path + "/:id", access, trustedOrigin, writes, respond((req, actor) => posts.withdraw(actor, req.params.organizationId, req.params.id)));
  return router;
}
