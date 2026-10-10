import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const parameters = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
let inFlight = 0;

async function deriveBounded(password, salt) {
  // Bound expensive work instead of allowing unbounded memory allocation.
  if (inFlight >= 2) {
    const error = new Error("Authentication is busy. Please try again shortly.");
    error.status = 503;
    throw error;
  }

  inFlight += 1;
  try {
    return await deriveKey(password, salt, 64, parameters);
  } finally {
    inFlight -= 1;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await deriveBounded(password, salt);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

// A missing account still performs the same expensive password derivation.
export const DUMMY_PASSWORD_HASH = `scrypt$131072$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function verifyPassword(password, encodedHash) {
  // Only accept the supported hash format; never trust database cost parameters.
  if (typeof encodedHash !== "string" ||
      !/^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encodedHash)) {
    return false;
  }
  const parts = encodedHash.split("$");
  const actual = await deriveBounded(password, Buffer.from(parts[4], "hex"));
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
}
