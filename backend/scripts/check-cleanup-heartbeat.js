import { readFile } from "node:fs/promises";
try {
  const result = JSON.parse(await readFile("/state/identity-cleanup.json", "utf8"));
  const age = Date.now() - Date.parse(result.completedAt);
  if (result.status !== "success" || !Number.isFinite(age) || age < 0 || age > 35 * 60000) throw Error();
} catch { console.error("Cleanup has no recent successful heartbeat."); process.exitCode = 1; }
