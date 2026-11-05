import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createRequireAuth, createSessionCookieConfig, requireTrustedOrigin } from "../auth/session.http.js";
import { fail } from "../network/network.schema.js";

export function createOrganizationPostRoutes({ posts, sessions, clientUrl, nodeEnv }) {
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
  router.get("/explore/posts", access, respond((req, actor) => posts.feed(actor, req.query)));
  router.get("/posts/me", access, respond((req, actor) => posts.memberList(actor, req.query)));
  router.post("/posts/me", access, trustedOrigin, writes, respond((req, actor) => posts.memberPublish(actor, req.body), 201));
  router.delete("/posts/me/:id", access, trustedOrigin, writes, respond((req, actor) => posts.memberWithdraw(actor, req.params.id)));
  router.get(path, access, respond((req, actor) => posts.list(actor, req.params.organizationId, req.query)));
  router.post(path, access, trustedOrigin, writes, respond((req, actor) => posts.publish(actor, req.params.organizationId, req.body), 201));
  router.delete(path + "/:id", access, trustedOrigin, writes, respond((req, actor) => posts.withdraw(actor, req.params.organizationId, req.params.id)));
  return router;
}
