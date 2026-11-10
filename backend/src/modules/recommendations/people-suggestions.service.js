import { Prisma } from "@prisma/client";
import { assertNetworkSession } from "../network/network-authority.js";

export function createPeopleSuggestions({ prisma, now = () => new Date() }) {
  return async actor => {
    await assertNetworkSession(prisma, actor, now);
    const viewerId = actor.accountId;
    const rows = await prisma.$queryRaw(Prisma.sql`
      WITH viewer AS (
        SELECT p.skills, p.interests, lower(nullif(p."careerField", '')) AS career
        FROM "Account" a JOIN "Profile" p ON p."personId" = a."personId"
        WHERE a.id = ${viewerId}
      ), matches AS (
        SELECT p."personId"
        FROM "Profile" p CROSS JOIN viewer v
        WHERE p.skills && v.skills
        UNION
        SELECT p."personId"
        FROM "Profile" p CROSS JOIN viewer v
        WHERE p.interests && v.interests
        UNION
        SELECT p."personId"
        FROM "Profile" p CROSS JOIN viewer v
        WHERE p."careerField" IS NOT NULL
          AND lower(p."careerField") = v.career
      ), ranked AS (
        SELECT a.username, concat_ws(' ', person."firstName", nullif(person."middleName", ''), person."lastName") AS name,
               (SELECT count(*) FROM (SELECT unnest(p.skills) INTERSECT SELECT unnest(v.skills)) overlap) AS skills,
               (SELECT count(*) FROM (SELECT unnest(p.interests) INTERSECT SELECT unnest(v.interests)) overlap) AS interests,
               coalesce(lower(p."careerField") = v.career, false) AS career
        FROM matches
        JOIN "Account" a ON a."personId" = matches."personId"
        JOIN "Person" person ON person.id = a."personId"
        JOIN "Profile" p ON p."personId" = person.id
        CROSS JOIN viewer v
        WHERE a.status = 'ACTIVE' AND a.id <> ${viewerId}
          AND NOT EXISTS (
            SELECT 1 FROM "NetworkFollow" f
            WHERE f."followerId" = ${viewerId} AND f."targetAccountId" = a.id AND f.active
          )
          AND NOT EXISTS (
            SELECT 1 FROM "NetworkPair" b
            WHERE (b."leftBlocked" OR b."rightBlocked" OR b.status IN ('CONNECTED', 'PENDING'))
              AND ((b."leftAccountId" = ${viewerId} AND b."rightAccountId" = a.id)
                OR (b."rightAccountId" = ${viewerId} AND b."leftAccountId" = a.id))
          )
      )
      SELECT username, name, skills, interests, career
      FROM ranked
      ORDER BY (3 * skills + 2 * interests + 4 * career::int) DESC, username ASC
      LIMIT 8
    `);
    await assertNetworkSession(prisma, actor, now);
    return {
      items: rows.map(row => ({
        name: row.name,
        username: row.username,
        reasons: [
          ...(row.skills > 0 ? ["Shared skills"] : []),
          ...(row.interests > 0 ? ["Shared interests"] : []),
          ...(row.career ? ["Same career field"] : []),
        ],
      })),
    };
  };
}
