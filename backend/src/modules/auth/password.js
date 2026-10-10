import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const parameters = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
let inFlight = 0;

export async function hashPassword(password) {
  // Bound expensive work instead of allowing unbounded memory allocation.
  if (inFlight >= 2) {
    const error = new Error("Registration is busy. Please try again shortly.");
    error.status = 503;
    throw error;
  }

  inFlight += 1;
  try {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, 64, parameters);
    return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt.toString("hex")}$${key.toString("hex")}`;
  } finally {
    inFlight -= 1;
  }
}
