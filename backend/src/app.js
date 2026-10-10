
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import apiRoutes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

/**
 * Security headers.
 */
app.use(helmet());

/**
 * Allow requests from the configured React frontend.
 *
 * Production origins will be configured through
 * CLIENT_URL during deployment.
 */
app.use(
  cors({
    origin: new URL(env.CLIENT_URL).origin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);

/**
 * Parse JSON requests.
 * Limit payload sizes to reduce abuse.
 */
app.use(express.json({ limit: "1mb" }));

/**
 * Register versioned BrightWay API endpoints.
 */
app.use("/api/v1", apiRoutes);

/**
 * Handle undefined routes and unexpected errors.
 * These must come after application routes.
 */
app.use(notFound);
app.use(errorHandler);

export default app;
