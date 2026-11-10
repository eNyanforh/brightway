import assert from "node:assert/strict";
import { test } from "node:test";
import { createContentSearch } from "../src/modules/search/content-search.service.js";

const viewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const session = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actor = { accountId: viewer, sessionId: session };
const when = new Date("2026-11-10T12:00:00.000Z");

function candidate(n, type) {
  return { id: "cccccccc-cccc-4ccc-8ccc-" + String(n).padStart(12, "0"),
    type, rank: n % 5, createdAt: when };
}
function visiblePost(row) {
  return {
    id: row.id, type: row.type, body: "Learning design for community students",
    tags: ["education", "technology"],
    questionDetails: row.type === "QUESTION" ? { title: "How do students learn?" } : null,
    eventDetails: row.type === "EVENT" ? { title: "Innovation weekend", meetingUrl: "https://private.example.invalid" } : null,
    member: { name: "A. Member", username: "amember", verified: true, photoId: null },
    createdAt: when,
  };
}
function fixture(rows, blocked = new Set()) {
  const seen = { query: "", calls: 0, read: [] };
  const prisma = {
    $queryRaw: async sql => {
      const query = sql.strings.join("?");
      if (query.includes('FROM "Session"')) return [{ id: session }];
      seen.query = query;
      seen.calls++;
      return rows;
    },
  };
  const posts = { async readPost(_actor, source, id) {
    seen.read.push({ source, id });
    if (blocked.has(id)) throw Object.assign(new Error("Unavailable"), { status: 404 });
    const row = rows.find(item => item.id === id);
    return { post: visiblePost(row) };
  } };
  return { search: createContentSearch({ prisma, posts }), seen };
}

test("search rejects invalid content filters and too-short searches before querying storage", async () => {
  const { search, seen } = fixture([]);
  await assert.rejects(search(actor, { q: "ab", kind: "opportunities" }), { status: 400 });
  await assert.rejects(search(actor, { q: "!" }), { status: 400 });
  await assert.rejects(search(actor, { q: "a" }), { status: 400 });
  assert.equal(seen.calls, 0);
});

test("search uses Explore visibility and returns only authorized post previews", async () => {
  const rows = [
    candidate(1, "ACHIEVEMENT"),
    candidate(2, "QUESTION"),
    candidate(3, "EVENT"),
  ];
  const { search, seen } = fixture(rows, new Set([rows[1].id]));
  const result = await search(actor, { q: "Innovation", kind: "all" });
  assert.equal(result.nextCursor, null);
  assert.deepEqual(result.items.map(item => item.kind), ["achievements", "events"]);
  assert.ok(result.items.every(item => item.member.verified));
  assert.match(result.items[1].href, /^\/explore\?source=member&post=/);
  assert.equal(result.items[1].name, "Innovation weekend");
  assert.equal(JSON.stringify(result).includes("private.example.invalid"), false,
    "Search must not expose an event's approval-only online meeting link");
  assert.deepEqual(seen.read.map(row => row.source), ["member", "member", "member"]);
  assert.match(seen.query, /withdrawnAt/);
  assert.match(seen.query, /leftBlocked/);
});

test("cursor ties scope to viewer, query, filter and rank position", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => candidate(i + 1, "ACHIEVEMENT"));
  const { search } = fixture(rows);
  const first = await search(actor, { q: "learning", kind: "achievements" });
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  await assert.rejects(search({ ...actor, accountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
    { q: "learning", kind: "achievements", cursor: first.nextCursor }), { status: 400 });
  await assert.rejects(search(actor, { q: "different", kind: "achievements", cursor: first.nextCursor }), { status: 400 });
  await assert.rejects(search(actor, { q: "learning", kind: "events", cursor: first.nextCursor }), { status: 400 });
});
