import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createPhotoRoutes } from "../src/modules/photos/photo.routes.js";

test("disconnecting an upload does not release capacity before its work finishes", async () => {
  const app = express();
  const releases = [];
  const starts = [];
  const started = () => new Promise((resolve) => starts.push(resolve));
  let disconnected;
  const closed = new Promise((resolve) => { disconnected = resolve; });
  app.use((req, res, next) => {
    if (req.get("X-Test-First")) res.once("close", disconnected);
    next();
  });
  let count = 0;
  app.use(createPhotoRoutes({
    photos: { async uploadDraft() {
      count++;
      starts.shift()?.();
      if (count <= 2) await new Promise((resolve) => releases.push(resolve));
      return { photoAssetId: "sample" };
    } },
    sessions: {}, clientUrl: "http://localhost:5173", nodeEnv: "test",
    limiter: (req, res, next) => next(),
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/auth/signup-drafts/photo`;
  const headers = { Origin: "http://localhost:5173", "Content-Type": "image/png" };
  const request = (extra = {}) => fetch(url, { method: "POST", body: "image", headers, ...extra });
  const controller = new AbortController();
  try {
    const firstStarted = started();
    const first = request({ signal: controller.signal, headers: { ...headers, "X-Test-First": "true" } }).catch(() => null);
    await firstStarted;
    const secondStarted = started();
    const second = request();
    await secondStarted;
    assert.equal((await request()).status, 503);
    controller.abort();await closed;
    assert.equal((await request()).status, 503);
    releases.forEach((resolve) => resolve());
    await first;assert.equal((await second).status, 201);
    assert.equal((await request()).status, 201);
  } finally {
    releases.forEach((resolve) => resolve());
    controller.abort();
    await new Promise((resolve) => server.close(resolve));
  }
});