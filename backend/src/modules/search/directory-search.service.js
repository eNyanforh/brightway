import { Prisma } from "@prisma/client";
import { createManualIdentityReviewService } from "../manual-identity/manual-identity-review.service.js";
import { memberProfilePath } from "../../../../shared/member-profile-paths.mjs";
import { z } from "zod";
import { assertNetworkSession } from "../network/network-authority.js";
import { prefixSearchQuery } from "./search-terms.js";
import { fail } from "../network/network.schema.js";

const pageSize = 20;
const kindSchema = z.enum(["people", "organizations"]);
const filterSchema = z.enum(["all", ...kindSchema.options]);
const querySchema = z.strictObject({
  q: z.string().trim().min(2).max(80).transform(value => value.normalize("NFC").replace(/\s+/gu, " ")),
  kind: filterSchema.default("all"),
  cursor: z.string().min(1).max(700).optional(),
});
const cursorSchema = z.strictObject({
  viewer: z.uuid(),
  q: z.string().max(80),
  filter: filterSchema,
  rank: z.int().min(0).max(4),
  kind: kindSchema,
  username: z.string().min(1).max(80),
});

function readCursor(cursor, viewer, q, filter) {
  if (!cursor) return null;
  try {
    const value = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (value.viewer === viewer && value.q === q && value.filter === filter) return value;
  } catch {
    // Invalid cursor text must never change the query scope.
  }
  throw fail(400, "Run the search again before opening another page.");
}

function peopleCandidates(query, viewer) {
  return Prisma.sql`
    SELECT 'people'::text AS kind, a.id, a.username,
           concat_ws(' ', p."firstName", nullif(p."middleName", ''), p."lastName") AS name,
           profile.headline, profile."photoId"
    FROM (
      SELECT p.id AS "personId"
      FROM "Person" p
      WHERE to_tsvector('simple', p."firstName" || ' ' || coalesce(p."middleName", '') || ' ' || p."lastName")
            @@ to_tsquery('simple', ${query})
      UNION
      SELECT profile."personId" FROM "Profile" profile
      WHERE to_tsvector('simple', coalesce(profile.headline, '') || ' ' ||
            coalesce(profile."careerField", '') || ' ' || coalesce(profile.bio, '') || ' ' ||
            coalesce(array_to_string(profile.skills, ' '), '') || ' ' ||
            coalesce(array_to_string(profile.interests, ' '), '') || ' ' ||
            coalesce(profile.locality, '') || ' ' || coalesce(profile.region, ''))
            @@ to_tsquery('simple', ${query})
      UNION
      SELECT a."personId" FROM "Account" a
      WHERE a.status = 'ACTIVE' AND to_tsvector('simple', replace(a.username, '_', ' ')) @@ to_tsquery('simple', ${query})
    ) matches
    JOIN "Person" p ON p.id = matches."personId"
    JOIN "Account" a ON a."personId" = p.id
    LEFT JOIN "Profile" profile ON profile."personId" = p.id
    WHERE a.status = 'ACTIVE' AND a.id <> ${viewer}
      AND NOT EXISTS (
        SELECT 1 FROM "NetworkPair" b
        WHERE (b."leftBlocked" OR b."rightBlocked") AND
          ((b."leftAccountId" = ${viewer} AND b."rightAccountId" = a.id) OR
           (b."rightAccountId" = ${viewer} AND b."leftAccountId" = a.id))
      )
  `;
}

function organizationCandidates(query) {
  return Prisma.sql`
    SELECT 'organizations'::text AS kind, o.id, o.username, o.name,
           NULL::text AS headline, NULL::text AS "photoId"
    FROM "Organization" o
    JOIN "OrganizationRequest" r ON r.id = o."requestId" AND r.status = 'APPROVED'
    WHERE o.status = 'ACTIVE' AND o."profileReadyAt" IS NOT NULL
      AND o."profilePhotoId" IS NOT NULL AND o.username IS NOT NULL AND o."profileSetupStep" = 5
      AND to_tsvector('simple', o.name || ' ' || replace(coalesce(o.username, ''), '_', ' '))
          @@ to_tsquery('simple', ${query})
  `;
}

export function createDirectorySearch({ prisma, now = () => new Date() }) {
  const identity = createManualIdentityReviewService({ prisma, now });
  return async (actor, input) => {
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) throw fail(400, "Enter a search of 2 to 80 characters and choose a valid filter.");
    const { q, kind, cursor } = parsed.data;
    const prefixQuery = prefixSearchQuery(q);
    if (!prefixQuery) throw fail(400, "Enter at least two letters or numbers and up to eight search terms.");
    await assertNetworkSession(prisma, actor, now);
    const after = readCursor(cursor, actor.accountId, q, kind);
    const people = kind !== "organizations" ? peopleCandidates(prefixQuery, actor.accountId) : null;
    const organizations = kind !== "people" ? organizationCandidates(prefixQuery) : null;
    const candidates = Prisma.join([people, organizations].filter(Boolean), " UNION ALL ");
    const handle = q.replace(/^@/u, "");
    const rows = await prisma.$queryRaw(Prisma.sql`
      WITH matches AS (${candidates}), ranked AS (
        SELECT *, CASE
          WHEN lower(username) = lower(${handle}) THEN 0
          WHEN lower(name) = lower(${q}) THEN 1
          WHEN starts_with(lower(username), lower(${handle})) THEN 2
          WHEN starts_with(lower(name), lower(${q})) THEN 3
          ELSE 4
        END AS rank
        FROM matches
      )
      SELECT kind, id, username, name, headline, "photoId", rank FROM ranked
      ${after ? Prisma.sql`WHERE (rank, kind, username) > (${after.rank}::int, ${after.kind}, ${after.username})` : Prisma.empty}
      ORDER BY rank, kind, username
      LIMIT ${pageSize + 1}
    `);
    await assertNetworkSession(prisma, actor, now);
    const page = rows.slice(0, pageSize);
    // Count only results actually returned, never blocked members.
    // Deduplicate by viewer and UTC date; do not retain search text.
    const currentTime = now();
    const searchedOn = new Date(Date.UTC(
      currentTime.getUTCFullYear(), currentTime.getUTCMonth(), currentTime.getUTCDate(),
    ));
    const members = page.filter(item => item.kind === "people");
    if (members.length) {
      await prisma.profileSearchAppearance.createMany({
        data: members.map(item => ({
          ownerId: item.id, viewerId: actor.accountId, searchedOn, createdAt: currentTime,
        })),
        skipDuplicates: true,
      });
    }
    // Identity verification is resolved through the same authority as public profiles.
    // Do not infer verified status from submitted evidence or an old approval flag.
    const verified = new Set();
    for (let offset = 0; offset < members.length; offset += 4) {
      await Promise.all(members.slice(offset, offset + 4).map(async item => {
        try {
          const result = await identity.inspectAccount(prisma, item.id);
          if (result.status === "APPROVED") verified.add(item.id);
        } catch (error) {
          if (error.status !== 403) throw error;
        }
      }));
    }
    await assertNetworkSession(prisma, actor, now);
    const last = page.at(-1);
    const nextCursor = rows.length > pageSize ? Buffer.from(JSON.stringify({
      viewer: actor.accountId, q, filter: kind, rank: last.rank, kind: last.kind, username: last.username,
    })).toString("base64url") : null;
    return {
      items: page.map(item => ({
        kind: item.kind, name: item.name, username: item.username,
        headline: item.kind === "people" ? item.headline : null,
        photoId: item.kind === "people" ? item.photoId : null,
        verified: item.kind === "organizations" || verified.has(item.id),
        href: item.kind === "people" ? memberProfilePath(item.username) : "/organizations/" + encodeURIComponent(item.id),
      })),
      nextCursor,
    };
  };
}
