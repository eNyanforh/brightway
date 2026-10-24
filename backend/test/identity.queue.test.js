import test from "node:test";
import assert from "node:assert/strict";
import { identityFixture } from "../test-support/identity-fixture.js";
import { createIdentityQueue } from "../src/modules/identity/identity.queue.js";

async function setup() {
  const f = identityFixture(); await f.service.start("owner"); f.advance(1000);
  const event = f.event(f.state.identityInquiry[0], "approved");
  return { ...f, event, queue: createIdentityQueue({ prisma: f.db, identity: f.service, now: f.now }) };
}
test("enqueue persists only a minimal event and makes no identity mutation until a separate worker runs", async () => {
  const f = await setup();
  await f.queue.enqueue(f.event);
  assert.equal(f.state.identityWebhookJob.length, 1);
  assert(!JSON.stringify(f.state.identityWebhookJob).includes("Private provider name"));
  assert.equal((await f.service.read("owner")).status, "created");
  assert.equal(f.state.identityWebhookReceipt.length, 0);
  assert.equal((await f.queue.processBatch()).processed, 1);
  assert.equal((await f.service.read("owner")).sandboxApproved, true);
  assert.equal((await f.service.read("owner")).identityVerified, false);
  assert.equal(f.state.identityWebhookJob[0].state, "DONE");
});
test("failed or slow durable storage never produces a successful acknowledgement; late inserts can be safely retried", async () => {
  const f = await setup();
  const original = f.db.identityWebhookJob.upsert;
  f.db.identityWebhookJob.upsert = async () => { throw Error("private connection detail"); };
  await assert.rejects(f.queue.enqueue(f.event), (e) => e.status === 503 && !e.message.includes("private"));
  assert.equal(f.state.identityWebhookJob.length, 0);
  let finish;
  f.db.identityWebhookJob.upsert = (args) => new Promise((resolve) => { finish = async () => resolve(await original.call(f.db.identityWebhookJob, args)); });
  const fast = createIdentityQueue({ prisma: f.db, saveTimeoutMs: 10 });
  await assert.rejects(fast.enqueue(f.event), { status: 503 });
  assert.equal(f.state.identityWebhookJob.length, 0);
  await finish(); f.db.identityWebhookJob.upsert = original;
  await f.queue.enqueue(f.event); assert.equal(f.state.identityWebhookJob.length, 1);
});
test("duplicate delivery cannot overwrite a queued payload or reset a completed job", async () => {
  const f = await setup(); await f.queue.enqueue(f.event); await f.queue.processBatch();
  const before = structuredClone(f.state.identityWebhookJob[0]);
  f.event.data.attributes.payload.data.attributes.status = "declined";
  await f.queue.enqueue(f.event);
  assert.deepEqual(f.state.identityWebhookJob[0], before);
  assert.equal((await f.queue.processBatch()).processed, 0);
});
test("a worker recreated after process restart resumes durable jobs; concurrent workers claim only one processing lease", async () => {
  const f = await setup(); await f.queue.enqueue(f.event);
  const other = createIdentityQueue({ prisma: f.db, identity: f.service, now: f.now });
  const results = await Promise.all([f.queue.processBatch(), other.processBatch()]);
  assert.equal(results.reduce((sum, r) => sum + r.processed, 0), 1);
  assert.equal(f.state.identityWebhookReceipt.length, 1);
});
test("expired processing leases recover after a crash and an old lease cannot acknowledge the recovered job", async () => {
  const f = await setup(); await f.queue.enqueue(f.event);
  const row = f.state.identityWebhookJob[0]; row.state = "PROCESSING"; row.leaseToken = "abandoned"; row.leaseUntil = new Date(+f.now() - 1); row.attempts = 1;
  assert.equal((await f.queue.processBatch()).processed, 1);
  assert.equal(row.attempts, 2);
  assert.equal((await f.db.identityWebhookJob.updateMany({ where: { id: row.id, leaseToken: "abandoned" }, data: { state: "PENDING" } })).count, 0);
});
test("failed transactional processing retains a retriable job and rolls back its result/receipt", async () => {
  const f = await setup(); f.failReceipt(); await f.queue.enqueue(f.event);
  assert.equal((await f.queue.processBatch()).retried, 1);
  assert.equal((await f.service.read("owner")).status, "created"); assert.equal(f.state.identityWebhookReceipt.length, 0);
  assert.equal(f.state.identityWebhookJob[0].state, "PENDING");
  assert.equal((await f.queue.processBatch()).retried, 0);
  f.advance(3000); assert.equal((await f.queue.processBatch()).retried, 1);
});
test("a crash after applying the event but before acknowledging its job replays safely", async () => {
  const f = await setup(); await f.queue.enqueue(f.event);
  const original = f.db.identityWebhookJob.updateMany; let once = true;
  f.db.identityWebhookJob.updateMany = async function(args) {
    if (once && args.data.state === "DONE") { once = false; throw Error("lost acknowledgement"); }
    return original.call(this, args);
  };
  assert.equal((await f.queue.processBatch()).retried, 1);
  assert.equal(f.state.identityWebhookReceipt.length, 1);
  f.advance(3000); assert.equal((await f.queue.processBatch()).processed, 1);
  assert.equal(f.state.identityWebhookReceipt.length, 1);
});
test("stale events remain isolated, retries are bounded, and exhausted crashed jobs become operator-visible failures", async () => {
  const f = await setup(); await f.queue.enqueue(f.event);
  f.state.account[0].person.firstName = "Changed";
  await f.queue.processBatch(); assert.equal((await f.service.read("owner")).sandboxApproved, false);
  assert.equal(f.state.identityWebhookReceipt[0].outcome, "STALE");
  const g = await setup(); await g.queue.enqueue(g.event); g.failReceipt();
  g.state.identityWebhookJob[0].attempts = 9;
  assert.equal((await g.queue.processBatch()).failed, 1); assert.equal(g.state.identityWebhookJob[0].state, "FAILED");
  const h = await setup(); await h.queue.enqueue(h.event);
  Object.assign(h.state.identityWebhookJob[0], { state: "PROCESSING", attempts: 10, leaseUntil: new Date(+h.now() - 1) });
  assert.equal((await h.queue.processBatch()).failed, 1); assert.equal(h.state.identityWebhookJob[0].state, "FAILED");
});
