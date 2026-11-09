import { assertNetworkSession } from "../network/network-authority.js";

const period = 7 * 24 * 60 * 60 * 1000;

/**
 * Private summary only: no viewer identifiers, search queries, or author details
 * leave this service. Each profile/search visitor is counted once per UTC day.
 * Post impressions reflect BrightWay's existing deduplicated post-view events.
 */
export function createProfileDashboardService({ prisma, now = () => new Date() }) {
  return {
    async read(actor) {
      await assertNetworkSession(prisma, actor, now);
      const measuredSince = new Date(now().getTime() - period);
      const [profileViews, postImpressions, searchAppearances] = await Promise.all([
        prisma.profileVisit.count({
          where: { ownerId: actor.accountId, createdAt: { gte: measuredSince } },
        }),
        prisma.postView.count({
          where: {
            createdAt: { gte: measuredSince },
            accountId: { not: actor.accountId },
            memberPost: { authorId: actor.accountId, withdrawnAt: null },
          },
        }),
        prisma.profileSearchAppearance.count({
          where: { ownerId: actor.accountId, createdAt: { gte: measuredSince } },
        }),
      ]);
      await assertNetworkSession(prisma, actor, now);
      return {
        periodDays: 7,
        measuredSince: measuredSince.toISOString(),
        profileViews,
        postImpressions,
        searchAppearances,
      };
    },
  };
}
