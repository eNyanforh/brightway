import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function decode(value) {
  let bits = 0, buffer = 0; const bytes = [];
  for (const char of value) { const digit = alphabet.indexOf(char); if (digit < 0) throw new Error("Invalid authenticator secret"); buffer = (buffer << 5) | digit; bits += 5; if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
export const fingerprint = (value) => createHash("sha256").update(value).digest("hex");
export function safeEqual(a, b) { return typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export function totp(secret, counter, digits = 6, algorithm = "sha1") {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac(algorithm, decode(secret)).update(bytes).digest(); const offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}
export function matchTotp(secret, code, date, lastCounter = -1n) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = BigInt(Math.floor(+date / 30000)); let matched = null;
  for (const delta of [-1n, 0n, 1n]) { const counter = current + delta; if (counter >= 0n && safeEqual(totp(secret, counter), code) && counter > lastCounter) matched = counter; }
  return matched;
}
export function secretBox(keyHex) {
  function key() {
    if (typeof keyHex !== "string" || !/^[a-f0-9]{64}$/i.test(keyHex)) throw Object.assign(new Error("Two-factor authentication is temporarily unavailable. Check server configuration."), { status: 503 });
    return Buffer.from(keyHex, "hex");
  }
  return {
    check: key,
    seal(accountId, secret) {
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), nonce); cipher.setAAD(Buffer.from(`brightway-mfa-v1:${accountId}`));
      const bytes = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]); return ["v1", nonce.toString("hex"), cipher.getAuthTag().toString("hex"), bytes.toString("hex")].join(":");
    },
    open(accountId, encoded) {
      const encryptionKey = key();
      try {
        const [version, nonce, tag, bytes, extra] = encoded.split(":");
        if (version !== "v1" || extra !== undefined || !/^[a-f0-9]{24}$/.test(nonce) || !/^[a-f0-9]{32}$/.test(tag) || !/^[a-f0-9]+$/.test(bytes)) throw new Error();
        const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(nonce, "hex")); decipher.setAAD(Buffer.from(`brightway-mfa-v1:${accountId}`)); decipher.setAuthTag(Buffer.from(tag, "hex"));
        return Buffer.concat([decipher.update(Buffer.from(bytes, "hex")), decipher.final()]).toString("utf8");
      } catch { throw Object.assign(new Error("Two-factor authentication is temporarily unavailable."), { status: 503 }); }
    },
  };
}
export function recoveryCodes() { return Array.from({ length: 10 }, () => randomBytes(12).toString("hex").match(/.{6}/g).join("-")); }
export const recoveryHash = (code) => fingerprint(code.toLowerCase().replace(/-/g, ""));
