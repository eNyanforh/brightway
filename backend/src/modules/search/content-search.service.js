import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertNetworkSession } from "../network/network-authority.js";
import { prefixSearchQuery } from "./search-terms.js";
import { fail } from "../network/network.schema.js";

const pageSize = 20;
const scanLimit = 80;
const kinds = ["all", "achievements", "questions", "events"];
const kindsToTypes = { achievements: "ACHIEVEMENT", questions: "QUESTION", events: "EVENT" };
const typesToKinds = { ACHIEVEMENT: "achievements", QUESTION: "questions", EVENT: "events" };
const querySchema = z.strictObject({
  q: z.string().trim().min(2).max(80).transform(value => value.normalize("NFC").replace(/\s+/gu, " ")),
  kind: z.enum(kinds).default("all"),
  cursor: z.string().min(1).max(700).optional(),
});
const cursorSchema = z.strictObject({
  viewer: z.uuid(),
  q: z.string().max(80),
  kind: z.enum(kinds),
  rank: z.int().min(0).max(4),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

function readCursor(token, viewer, q, kind) {
  if (!token) return null;
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(token, "base64url").toString("utf8")));
    if (cursor.viewer === viewer && cursor.q === q && cursor.kind === kind) return cursor;
  } catch {
    // An invalid or foreign cursor never changes the query scope.
  }
  throw fail(400, "Run the search again before opening another page.");
}

function makeCursor(row, actor, q, kind) {
  return Buffer.from(JSON.stringify({
    viewer: actor.accountId, q, kind, rank: row.rank,
    createdAt: new Date(row.createdAt).toISOString(), id: row.id,
  })).toString("base64url");
}

function preview(post, rank) {
  const title = post.type === "QUESTION" ? post.questionDetails?.title
    : post.type === "EVENT" ? post.eventDetails?.title : null;
  const body = (post.body || "").trim();
  const heading = (title || body).slice(0, 135);
  const summary = body.length > 280 ? body.slice(0, 277).trimEnd() + "…" : body;
  return {
    kind: typesToKinds[post.type],
    name: heading,
    summary: summary === heading ? "" : summary,
    tags: Array.isArray(post.tags) ? post.tags.slice(0, 6) : [],
    member: {
      name: post.member.name,
      username: post.member.username,
      photoId: post.member.photoId || null,
      verified: post.member.verified === true,
    },
    createdAt: post.createdAt,
    relevance: rank,
    href: "/explore?" + new URLSearchParams({ source: "member", post: post.id }),
  };
}

// Reuse Explore's current authorization before returning post text. SQL only
// narrows candidates; readPost excludes withdrawn, unverified, and blocked posts.
export function createContentSearch({ prisma, posts, now = () => new Date() }) {
  return async function searchContent(actor, input) {
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) throw fail(400, "Enter 2 to 80 characters and choose a valid content filter.");
    const { q, kind, cursor } = parsed.data;
    const prefixQuery = prefixSearchQuery(q);
    if (!prefixQuery) throw fail(400, "Enter at least two letters or numbers and up to eight search terms.");
    await assertNetworkSession(prisma, actor, now);
    const after = readCursor(cursor, actor.accountId, q, kind);

    const searchable = Prisma.sql`to_tsvector('simple', p.body || ' ' ||
      coalesce(p."eventDetails"->>'title', '') || ' ' || coalesce(p."questionDetails"->>'title', ''))`;
    const title = Prisma.sql`coalesce(p."eventDetails"->>'title', p."questionDetails"->>'title', '')`;
    const filteredType = kind === "all" ? Prisma.empty
      : Prisma.sql`AND p.type = ${kindsToTypes[kind]}::"MemberPostType"`;

    const rows = await prisma.$queryRaw(Prisma.sql`
      WITH ranked AS (
        SELECT p.id, p.type, p."createdAt",
          CASE
            WHEN lower(${title}) = lower(${q}) THEN 0
            WHEN starts_with(lower(${title}), lower(${q})) THEN 1
            WHEN lower(p.body) = lower(${q}) THEN 2
            WHEN starts_with(lower(p.body), lower(${q})) THEN 3
            ELSE 4
          END AS rank
        FROM "MemberPost" p
        JOIN "Account" a ON a.id = p."authorId"
        WHERE p."withdrawnAt" IS NULL
          AND p.type IN ('ACHIEVEMENT', 'QUESTION', 'EVENT')
          AND a.status = 'ACTIVE'
          ${filteredType}
          AND (${searchable} @@ to_tsquery('simple', ${prefixQuery})
            OR to_tsvector('simple', array_to_string(p.tags, ' ')) @@ to_tsquery('simple', ${prefixQuery}))
          AND NOT EXISTS (
            SELECT 1 FROM "NetworkPair" b
            WHERE (b."leftBlocked" OR b."rightBlocked") AND
              ((b."leftAccountId" = ${actor.accountId} AND b."rightAccountId" = a.id) OR
               (b."rightAccountId" = ${actor.accountId} AND b."leftAccountId" = a.id))
          )
      )
      SELECT id, type, "createdAt", rank
      FROM ranked
      ${after ? Prisma.sql`WHERE rank > ${after.rank}::int
        OR (rank = ${after.rank}::int AND "createdAt" < ${new Date(after.createdAt)})
        OR (rank = ${after.rank}::int AND "createdAt" = ${new Date(after.createdAt)} AND id < ${after.id})` : Prisma.empty}
      ORDER BY rank ASC, "createdAt" DESC, id DESC
      LIMIT ${scanLimit}
    `);

    const visible = [];
    // Bounded parallel checks preserve relevance order.
    for (let offset = 0; offset < rows.length && visible.length <= pageSize; offset += 6) {
      const batch = rows.slice(offset, offset + 6);
      const results = await Promise.all(batch.map(async row => {
        try {
          const { post } = await posts.readPost(actor, "member", row.id);
          if (!post || !typesToKinds[post.type] || post.type !== row.type) return null;
          return { row, item: preview(post, row.rank) };
        } catch (error) {
          if (error.status === 404) return null;
          throw error;
        }
      }));
      for (const entry of results) if (entry) visible.push(entry);
    }
    await assertNetworkSession(prisma, actor, now);

    const entries = visible.slice(0, pageSize);
    const more = visible.length > pageSize || rows.length === scanLimit;
    const position = visible.length > pageSize ? entries.at(-1)?.row : rows.at(-1);
    return {
      items: entries.map(entry => entry.item),
      nextCursor: more && position ? makeCursor(position, actor, q, kind) : null,
    };
  };
}
