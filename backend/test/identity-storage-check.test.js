import test from "node:test";
import assert from "node:assert/strict";
import { checkIdentityStorage } from "../scripts/check-identity-storage.js";
const id = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const objects = new Map(), touched = [], bytes = Buffer.from("synthetic WebP fixture");
  const key = `_brightway_checks/manual-identity/${id}.webp`;
  const storage = { check() {}, async put(k, data) { touched.push(k); objects.set(k, data); }, async get(k) { touched.push(k); return objects.get(k); }, async delete(k) { touched.push(k); objects.delete(k); } };
  return { key, objects, touched, storage, args: { id, storage, head: async (k) => objects.has(k), makeImage: async () => bytes } };
}
test("storage probe writes, reads and confirms deletion of only its unique synthetic key", async () => {
  const f = fixture(); f.objects.set("manual-identity/real-document", Buffer.from("untouched"));
  assert.deepEqual(await checkIdentityStorage(f.args), { written: true, exactReadback: true, deletionConfirmed: true });
  assert.deepEqual(f.touched, [f.key, f.key, f.key]); assert.equal(f.objects.size, 1); assert.equal(f.objects.get("manual-identity/real-document").toString(), "untouched");
});
test("probe never overwrites or deletes a pre-existing key and does not treat access errors as absence", async () => {
  const f = fixture(); f.objects.set(f.key, Buffer.from("pre-existing"));
  await assert.rejects(checkIdentityStorage(f.args)); assert.deepEqual(f.touched, []); assert.equal(f.objects.has(f.key), true);
  const g = fixture(); await assert.rejects(checkIdentityStorage({ ...g.args, head: async () => { throw Error("Access denied, not missing"); } })); assert.deepEqual(g.touched, []);
});
test("probe cleans a partially completed upload and rejects incorrect stored bytes", async () => {
  const f = fixture(); f.storage.put = async (key, bytes) => { f.objects.set(key, bytes); throw Error("Ambiguous write response"); };
  await assert.rejects(checkIdentityStorage(f.args)); assert.equal(f.objects.size, 0);
  const g = fixture(); g.storage.get = async () => Buffer.from("wrong bytes");
  await assert.rejects(checkIdentityStorage(g.args)); assert.equal(g.objects.size, 0);
});
test("probe rejects deletion that did not actually remove the object and reports only its synthetic key", async () => {
  const f = fixture(); f.storage.delete = async () => {};
  const error = await checkIdentityStorage(f.args).then(() => assert.fail("Expected deletion verification failure"), (e) => e);
  assert.equal(error.syntheticObjectKey, f.key); assert(!error.message.includes("secret")); assert.equal(f.objects.size, 1);
});
test("probe never starts storage writes when private configuration fails", async () => {
  const f = fixture(); f.storage.check = () => { throw Error("invalid configuration"); };
  await assert.rejects(checkIdentityStorage(f.args)); assert.deepEqual(f.touched, []);
});
