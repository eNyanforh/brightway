import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createOrganizationPostRoutes } from "../src/modules/posts/organization-posts.routes.js";

const accountId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";
const photo = Buffer.from("synthetic-webp-photo");

test("publisher photo route requires a personal session and never bypasses visibility authorization", async () => {
  const app = express();
  let reads = 0;
  const sessions = {
    async authenticate(token) {
      if (token !== "valid-personal-session") throw Object.assign(Error("Sign in first."), { status: 401 });
      return { account: { id: accountId }, sessionId };
    },
  };
  const posts = {
    async memberPhoto(actor, username, requestedPhoto) {
      assert.deepEqual(actor, { accountId, sessionId });
      if (username !== "maya" || requestedPhoto !== photoId)
        throw Object.assign(Error("Unavailable photo."), { status: 404 });
      return { personId: "44444444-4444-4444-8444-444444444444", photoId };
    },
  };
  const photos = {
    async readOwner(personId, requestedPhoto) {
      reads++;
      assert.equal(personId, "44444444-4444-4444-8444-444444444444");
      assert.equal(requestedPhoto, photoId);
      return photo;
    },
  };
  app.use("/api/v1", createOrganizationPostRoutes({
    posts, photos, sessions, nodeEnv: "test", clientUrl: "http://localhost:5173",
  }));
  app.use((error, _req, res, _next) => res.status(error.status ?? 500)
    .json({ success: false, message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1/explore/members/";
  const authorized = { Cookie: "brightway_session=valid-personal-session" };
  try {
    const unauthenticated = await fetch(base + "maya/photo/" + photoId);
    assert.equal(unauthenticated.status, 401);
    assert.equal(reads, 0);

    const hidden = await fetch(base + "hidden/photo/" + photoId, { headers: authorized });
    assert.equal(hidden.status, 404);
    assert.equal(reads, 0);

    const stale = await fetch(base + "maya/photo/" + "55555555-5555-4555-8555-555555555555", { headers: authorized });
    assert.equal(stale.status, 404);
    assert.equal(reads, 0);

    const visible = await fetch(base + "maya/photo/" + photoId, { headers: authorized });
    assert.equal(visible.status, 200);
    assert.equal(visible.headers.get("cache-control"), "no-store");
    assert.match(visible.headers.get("content-type"), /^image\/webp/);
    assert.equal(Buffer.compare(Buffer.from(await visible.arrayBuffer()), photo), 0);
    assert.equal(reads, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
