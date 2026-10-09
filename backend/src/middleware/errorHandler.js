
import { env } from "../config/env.js";

/**
 * Centralized Express error handler.
 *
 * Unexpected server errors return a generic message
 * in production to avoid exposing internal details.
 */
export function errorHandler(err, req, res, next) {
  // Express recognizes error middleware by its
  // four-argument function signature.
  void next;

  const statusCode =
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status <= 599
      ? err.status
      : 500;

  console.error("API error:", err);

  const message =
    statusCode === 500 && env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  res.status(statusCode).json({
    success: false,
    message,
  });
}
