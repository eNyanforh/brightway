
/**
 * GET /api/v1/health
 *
 * Confirms that the Express application is responding.
 * This does not yet test database connectivity.
 */
export function getHealth(req, res) {
  res.status(200).json({
    success: true,
    message: "BrightWay API is running",
    data: {
      status: "healthy",
      service: "brightway-backend",
      timestamp: new Date().toISOString(),
    },
  });
}
