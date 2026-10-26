import { validateStagingEnvironment } from "./check-staging-env.js";
try {
  validateStagingEnvironment(process.env);
  await import("../src/server.js");
} catch {
  console.error("Private staging startup failed. Run the staging preflight and inspect sanitized service logs.");
  process.exitCode = 1;
}
