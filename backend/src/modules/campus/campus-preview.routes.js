import { createCampusRollout } from "./campus-rollout.js";
import { createCampusRoutes } from "./campus.routes.js";
import { createCampusService } from "./campus.service.js";

export function createCampusPreviewRoutes({ prisma, sessions, clientUrl, nodeEnv, config = {} }) {
  const rollout = createCampusRollout({ ...config, NODE_ENV: nodeEnv });
  return createCampusRoutes({
    campus: createCampusService({ prisma }), sessions, clientUrl, nodeEnv,
    isEnabledFor: rollout.allows, lifecycleOnly: true,
  });
}
