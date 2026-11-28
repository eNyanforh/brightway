import { z } from "zod";

// Stage 1 is a private, non-production API preview. Country eligibility and
// organization membership are separate service checks; this grants neither.
export function createCampusRollout(config = {}) {
  const ids = (config.VIRTUAL_CAMPUS_PREVIEW_ORGANIZATION_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
  const enabled = ["development", "test"].includes(config.NODE_ENV)
    && config.VIRTUAL_CAMPUS_PREVIEW_ENABLED === "true"
    && ids.length > 0 && ids.every(id => z.uuid().safeParse(id).success);
  const organizations = new Set(enabled ? ids : []);
  return Object.freeze({ enabled, allows: organizationId => organizations.has(organizationId) });
}
