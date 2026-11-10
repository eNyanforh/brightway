import { Prisma } from "@prisma/client";
import { memberProfilePath } from "../../../../shared/member-profile-paths.mjs";
import { z } from "zod";
import { assertNetworkSession } from "../network/network-authority.js";
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
           concat_ws(' ', p."firstName", nullif(p."middleName", ''), p."lastName") AS name
    FROM (
      SELECT p.id AS "personId"
      FROM "Person" p
      WHERE to_tsvector('simple', p."firstName" || ' ' || coalesce(p."middleName", '') || ' ' || p."lastName")
            @@ to_tsquery('simple', ${query})
      UNION
      SELECT a."personId" FROM "Account" a
      WHERE a.status = 'ACTIVE' AND to_tsvector('simple', replace(a.username, '_', ' ')) @@ to_tsquery('simple', ${query})
    ) matches
    JOIN "Person" p ON p.id = matches."personId"
    JOIN "Account" a ON a."personId" = p.id
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
    SELECT 'organizations'::text AS kind, o.id, o.username, o.name
    FROM "Organization" o
    JOIN "OrganizationRequest" r ON r.id = o."requestId" AND r.status = 'APPROVED'
    WHERE o.status = 'ACTIVE' AND o."profileReadyAt" IS NOT NULL
      AND o."profilePhotoId" IS NOT NULL AND o.username IS NOT NULL AND o."profileSetupStep" = 5
      AND to_tsvector('simple', o.name || ' ' || replace(coalesce(o.username, ''), '_', ' '))
          @@ to_tsquery('simple', ${query})
  `;
}

export function createDirectorySearch({ prisma, now = () => new Date() }) {
  return async (actor, input) => {
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) throw fail(400, "Enter a search of 2 to 80 characters and choose a valid filter.");
    const { q, kind, cursor } = parsed.data;
    const words = q.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
    if (words.join("").length < 2 || words.length > 8) throw fail(400, "Enter at least two letters or numbers and up to eight search terms.");
    const prefixQuery = words.map(word => word + ":*").join(" & ");
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
      SELECT kind, id, username, name, rank FROM ranked
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
    const last = page.at(-1);
    const nextCursor = rows.length > pageSize ? Buffer.from(JSON.stringify({
      viewer: actor.accountId, q, filter: kind, rank: last.rank, kind: last.kind, username: last.username,
    })).toString("base64url") : null;
    return {
      items: page.map(item => ({
        kind: item.kind, name: item.name, username: item.username,
        href: item.kind === "people" ? memberProfilePath(item.username) : "/organizations/" + encodeURIComponent(item.id),
      })),
      nextCursor,
    };
  };
}
