import { assertNetworkSession } from "../network/network-authority.js";

const period = 7 * 24 * 60 * 60 * 1000;

/**
 * Private owner analytics: totals never identify searchers. The bounded profile
 * viewer preview includes only active members with no blocks against
 * the owner. Raw IDs and search queries never leave this service.
 */
export function createProfileDashboardService({ prisma, now = () => new Date() }) {
  return {
    async read(actor) {
      await assertNetworkSession(prisma, actor, now);
      const measuredSince = new Date(now().getTime() - period);
      const blocked = [{ leftBlocked: true }, { rightBlocked: true }];
      const [profileViews, postImpressions, searchAppearances, consentingViews] = await Promise.all([
        prisma.profileVisit.count({
          where: { ownerId: actor.accountId, createdAt: { gte: measuredSince } },
        }),
        prisma.postView.count({
          where: {
            createdAt: { gte: measuredSince },
            accountId: { not: actor.accountId },
            memberPost: { authorId: actor.accountId, withdrawnAt: null, moderationStatus: "PUBLISHED" },
          },
        }),
        prisma.profileSearchAppearance.count({
          where: { ownerId: actor.accountId, createdAt: { gte: measuredSince } },
        }),
        prisma.profileVisit.findMany({
          where: {
            ownerId: actor.accountId, createdAt: { gte: measuredSince },
            viewer: {
              status: "ACTIVE",
              networkLeft: { none: { rightAccountId: actor.accountId, OR: blocked } },
              networkRight: { none: { leftAccountId: actor.accountId, OR: blocked } },
            },
          },
          distinct: ["viewerId"],
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 3,
          select: {
            viewer: { select: {
              username: true,
              person: { select: {
                firstName: true, middleName: true, lastName: true,
                profile: { select: { photoId: true } },
              } },
            } },
          },
        }),
      ]);
      await assertNetworkSession(prisma, actor, now);
      return {
        periodDays: 7,
        measuredSince: measuredSince.toISOString(),
        profileViews,
        postImpressions,
        searchAppearances,
        recentProfileViewers: consentingViews.map(({ viewer }) => ({
          username: viewer.username,
          name: [viewer.person.firstName, viewer.person.middleName, viewer.person.lastName]
            .filter(Boolean).join(" "),
          photoId: viewer.person.profile?.photoId ?? null,
        })),
      };
    },
  };
}
