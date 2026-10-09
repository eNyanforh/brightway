
import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/database.js";

const server = app.listen(env.PORT, () => {
  console.log("==================================");
  console.log(" BrightWay Backend API");
  console.log("==================================");
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log(`Port: ${env.PORT}`);
  console.log(
    `Health: http://localhost:${env.PORT}/api/v1/health`
  );
});

/**
 * Close the HTTP server and disconnect Prisma.
 */
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  server.close(async (error) => {
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error("Database shutdown error:", disconnectError);
      process.exitCode = 1;
    }

    if (error) {
      console.error("HTTP shutdown error:", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
