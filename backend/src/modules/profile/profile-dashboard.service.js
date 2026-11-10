import { assertNetworkSession } from "../network/network-authority.js";

const period = 7 * 24 * 60 * 60 * 1000;

/**
 * Signed-in owner analytics: profile visitors and searchers are identifiable
 * through bounded previews. Blocked/suspended accounts are excluded; searches
 * still never reveal search terms. Contact fields are never returned.
 */
export function createProfileDashboardService({ prisma, now = () => new Date() }) {
  return {
    async read(actor) {
      await assertNetworkSession(prisma, actor, now);
      const measuredSince = new Date(now().getTime() - period);
      const blocked = [{ leftBlocked: true }, { rightBlocked: true }];
      const previewWhere = {
        status: "ACTIVE",
        networkLeft: { none: { rightAccountId: actor.accountId, OR: blocked } },
        networkRight: { none: { leftAccountId: actor.accountId, OR: blocked } },
      };
      const selectMember = {
        viewer: { select: {
          username: true,
          person: { select: {
            firstName: true, middleName: true, lastName: true,
            profile: { select: { photoId: true } },
          } },
        } },
      };
      const preview = model => model.findMany({
        where: { ownerId: actor.accountId, createdAt: { gte: measuredSince },
          viewer: previewWhere },
        distinct: ["viewerId"],
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
        select: selectMember,
      });
      const [profileViews, postImpressions, searchAppearances, viewerRows, searcherRows] = await Promise.all([
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
        preview(prisma.profileVisit),
        preview(prisma.profileSearchAppearance),
      ]);
      await assertNetworkSession(prisma, actor, now);
      return {
        periodDays: 7,
        measuredSince: measuredSince.toISOString(),
        profileViews,
        postImpressions,
        searchAppearances,
        recentProfileViewers: viewerRows.map(({ viewer }) => ({
          username: viewer.username,
          name: [viewer.person.firstName, viewer.person.middleName, viewer.person.lastName]
            .filter(Boolean).join(" "),
          photoId: viewer.person.profile?.photoId ?? null,
        })),
        recentSearchers: searcherRows.map(({ viewer }) => ({
          username: viewer.username,
          name: [viewer.person.firstName, viewer.person.middleName, viewer.person.lastName]
            .filter(Boolean).join(" "),
          photoId: viewer.person.profile?.photoId ?? null,
        })),
      };
    },
  };
}
