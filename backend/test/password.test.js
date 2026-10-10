import test from "node:test";
import assert from "node:assert/strict";
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { hashPassword } from "../src/modules/auth/password.js";

test("password hashes have unique salts and derive the correct key", async () => {
  const password = "A long personal passphrase!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  const [algorithm, cost, block, parallel, salt, encodedKey] = first.split("$");
  assert.equal(algorithm, "scrypt");
  assert.equal(Number(cost), 131072);
  assert.equal(salt.length, 32);
  const derive = promisify(scrypt);
  const options = { N: Number(cost), r: Number(block), p: Number(parallel), maxmem: 192 * 1024 * 1024 };
  const expected = Buffer.from(encodedKey, "hex");
  const actual = await derive(password, Buffer.from(salt, "hex"), 64, options);
  const wrong = await derive("a different password", Buffer.from(salt, "hex"), 64, options);
  assert.equal(timingSafeEqual(actual, expected), true);
  assert.equal(timingSafeEqual(wrong, expected), false);
});

test("hashing concurrency is bounded and recovers after completion", async () => {
  const first = hashPassword("A long first passphrase");
  const second = hashPassword("A long second passphrase");
  await assert.rejects(hashPassword("A long third passphrase"), { status: 503 });
  await Promise.all([first, second]);
  assert.match(await hashPassword("A long final passphrase"), /^scrypt\$/);
});
