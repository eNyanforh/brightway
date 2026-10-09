
import { Router } from "express";

import { getHealth } from "../controllers/health.controller.js";
import { getDatabaseHealth } from "../controllers/database.controller.js";

const router = Router();

// Application health check
router.get("/health", getHealth);

// Database connectivity health check
router.get("/health/database", getDatabaseHealth);

export default router;
