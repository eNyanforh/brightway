
import { prisma } from "../config/database.js";

/**
 * GET /api/v1/health/database
 *
 * Verify that the application can execute
 * a query against the PostgreSQL database.
 */
export async function getDatabaseHealth(req, res, next) {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      message: "BrightWay database connection successful",
      data: {
        database: "postgresql",
        status: "connected",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Forward database failures to our central error handler.
    next(error);
  }
}
