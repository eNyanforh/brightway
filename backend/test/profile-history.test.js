import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { historySchema } from "../src/modules/profile/profile-history.schema.js";
import { createProfileService } from "../src/modules/profile/profile.service.js";
import { createProfileRoutes } from "../src/modules/profile/profile.routes.js";

const education = (changes = {}) => ({
  institution: "School",
  qualification: "Diploma",
  startMonth: "2020-09",
  endMonth: "2023-06",
  current: false,
  description: "",
  ...changes,
});
const experience = (changes = {}) => ({
  organization: "Community",
  role: "Coordinator",
  type: "VOLUNTEERING",
  startMonth: "2023-07",
  endMonth: null,
  current: true,
  description: "",
  ...changes,
});
const input = (records, expectedVersion = 0, mode = "RECORDS") => ({
  records,
  expectedVersion,
  mode,
});
const writable = ({ status, ...row }) => {
  void status;
  return row;
};

// Transaction snapshot commits only on success, with a queue modeling the profile lock.
function database() {
  let state = { profiles: [], education: [], experience: [] },
    queue = Promise.resolve();
  let fail;
  const project = (row, select) =>
    !row
      ? null
      : !select
        ? structuredClone(row)
        : Object.fromEntries(
            Object.entries(select).map(([key, value]) => {
              if (key === "educationRecords" || key === "experienceRecords") {
                const kind =
                  key === "educationRecords" ? "education" : "experience";
                return [
                  key,
                  state[kind]
                    .filter((r) => r.profileId === row.id)
                    .map((r) => project(r, value.select)),
                ];
              }
              return [key, row[key]];
            }),
          );
  function client(data) {
    return {
      profile: {
        async findUnique({ where, select }) {
          const row = data.profiles.find((p) => p.personId === where.personId);
          if (!row) return null;
          return project(
            {
              ...row,
              educationRecords: data.education.filter(
                (r) => r.profileId === row.id,
              ),
              experienceRecords: data.experience.filter(
                (r) => r.profileId === row.id,
              ),
            },
            select,
          );
        },
        async create({ data: row, select }) {
          if (data.profiles.some((p) => p.personId === row.personId))
            throw Object.assign(new Error("unique"), { code: "P2002" });
          const next = {
            id: randomUUID(),
            educationMode: "UNSET",
            experienceMode: "UNSET",
            skills: [],
            interests: [],
            ...row,
          };
          data.profiles.push(next);
          return project(next, select);
        },
        async updateMany({ where, data: changes }) {
          const row = data.profiles.find(
            (p) => p.personId === where.personId && p.version === where.version,
          );
          if (!row) return { count: 0 };
          Object.assign(row, changes, {
            version: row.version + changes.version.increment,
          });
          return { count: 1 };
        },
      },
      ...Object.fromEntries(
        ["education", "experience"].map((kind) => [
          `${kind}Record`,
          {
            async findMany({ where }) {
              return structuredClone(
                data[kind].filter((r) => r.profileId === where.profileId),
              );
            },
            async create({ data: row }) {
              if (fail) throw fail;
              const next = {
                id: randomUUID(),
                revision: 1,
                status: "DRAFT",
                ...row,
              };
              data[kind].push(next);
              return next;
            },
            async updateMany({ where, data: changes }) {
              const row = data[kind].find((r) =>
                Object.entries(where).every(([key, value]) => r[key] === value),
              );
              if (!row) return { count: 0 };
              Object.assign(row, changes, {
                revision: row.revision + changes.revision.increment,
              });
              return { count: 1 };
            },
            async deleteMany({ where }) {
              const index = data[kind].findIndex((r) =>
                Object.entries(where).every(([key, value]) => r[key] === value),
              );
              if (index < 0) return { count: 0 };
              data[kind].splice(index, 1);
              return { count: 1 };
            },
          },
        ]),
      ),
    };
  }
  // Project relations from the transaction snapshot, not the committed state.
  const db = {
    get state() {
      return state;
    },
    get profile() {
      return client(state).profile;
    },
    setFailure(error) {
      fail = error;
    },
    async $transaction(fn) {
      const task = queue.then(async () => {
        const previous = state,
          next = structuredClone(previous);
        state = next;
        try {
          return await fn(client(next));
        } catch (error) {
          state = previous;
          throw error;
        }
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  return db;
}

test("history validates month/year, current records, all experience types and explicit declarations", () => {
  assert.equal(
    historySchema("education").parse(
      input([education({ institution: " School " })]),
    ).records[0].institution,
    "School",
  );
  for (const type of [
    "EMPLOYMENT",
    "INTERNSHIP",
    "VOLUNTEERING",
    "SELF_EMPLOYMENT",
  ])
    assert(
      historySchema("experience").safeParse(input([experience({ type })]))
        .success,
    );
  for (const mode of ["NONE", "UNSET"])
    assert(historySchema("education").safeParse(input([], 0, mode)).success);
  for (const row of [
    education({ startMonth: "2020" }),
    education({ startMonth: "2020-13" }),
    education({ startMonth: "2199-01" }),
    education({ endMonth: "2019-01" }),
    education({ endMonth: null }),
    education({ current: true }),
    education({ status: "VERIFIED" }),
    education({ personId: "other" }),
    education({ id: randomUUID() }),
    education({ description: "x".repeat(1001) }),
  ])
    assert.equal(
      historySchema("education").safeParse(input([row])).success,
      false,
    );
  for (const body of [
    input([education()], 0, "NONE"),
    input([], 0, "RECORDS"),
    input(Array.from({ length: 21 }, () => education())),
    { ...input([education()]), verified: true },
  ])
    assert.equal(historySchema("education").safeParse(body).success, false);
  const id = randomUUID();
  assert.equal(
    historySchema("education").safeParse(
      input([education({ id, revision: 1 }), education({ id, revision: 1 })]),
    ).success,
    false,
  );
});

test("history supports multiple independently versioned records and never grants verification", async () => {
  const db = database(),
    service = createProfileService({ prisma: db });
  const first = await service.saveHistory(
    "owner",
    "education",
    input([
      education(),
      education({ institution: "College", current: true, endMonth: null }),
    ]),
  );
  assert.equal(first.version, 1);
  assert.equal(first.education.records.length, 2);
  assert(
    first.education.records.every(
      (r) => r.revision === 1 && r.status === "DRAFT" && !r.profileId,
    ),
  );
  const records = first.education.records.map(writable);
  records[0].qualification = "Updated diploma";
  const next = await service.saveHistory(
    "owner",
    "education",
    input(records, 1),
  );
  assert.equal(next.version, 2);
  assert.equal(next.education.records[0].revision, 2);
  assert.equal(next.education.records[1].revision, 1);
  const other = await service.saveHistory(
    "owner",
    "experience",
    input([experience()], 2),
  );
  assert.equal(other.education.records.length, 2);
  assert.equal(other.experience.records.length, 1);
  assert.equal(
    (await service.completion("owner")).eligibleToRequestVerification,
    false,
  );
});

test("foreign records, stale versions and stale revisions roll back the entire history transaction", async () => {
  const db = database(),
    service = createProfileService({ prisma: db });
  const owner = await service.saveHistory(
    "owner",
    "education",
    input([education()]),
  );
  await service.saveHistory(
    "other",
    "education",
    input([education({ institution: "Other school" })]),
  );
  const before = structuredClone(db.state);
  await assert.rejects(
    service.saveHistory(
      "other",
      "education",
      input(owner.education.records.map(writable), 1),
    ),
    { status: 404 },
  );
  assert.deepEqual(db.state, before);
  await assert.rejects(
    service.saveHistory("owner", "education", input([], 0, "NONE")),
    { status: 409 },
  );
  await assert.rejects(
    service.saveHistory(
      "owner",
      "education",
      input([writable({ ...owner.education.records[0], revision: 2 })], 1),
    ),
    { status: 409 },
  );
  assert.deepEqual(db.state, before);
});

test("explicit declarations remove only the chosen draft collection; reviewed records cannot be changed or removed", async () => {
  const db = database(),
    service = createProfileService({ prisma: db });
  await service.saveHistory("owner", "education", input([education()]));
  await service.saveHistory("owner", "experience", input([experience()], 1));
  const cleared = await service.saveHistory(
    "owner",
    "education",
    input([], 2, "NONE"),
  );
  assert.equal(cleared.education.mode, "NONE");
  assert.equal(cleared.education.records.length, 0);
  assert.equal(cleared.experience.records.length, 1);
  db.state.experience[0].status = "VERIFIED";
  const before = structuredClone(db.state);
  await assert.rejects(
    service.saveHistory("owner", "experience", input([], 3, "NONE")),
    { status: 409 },
  );
  assert.deepEqual(db.state, before);
  await assert.rejects(
    service.saveHistory(
      "owner",
      "experience",
      input(
        [
          writable({
            ...cleared.experience.records[0],
            role: "Changed",
            status: "VERIFIED",
          }),
        ],
        3,
      ),
    ),
    { status: 409 },
  );
  assert.deepEqual(db.state, before);
});

test("history storage failure does not leave a profile or partial records", async () => {
  const db = database(),
    service = createProfileService({ prisma: db });
  const error = new Error("database unavailable");
  db.setFailure(error);
  await assert.rejects(
    service.saveHistory("owner", "education", input([education()])),
    (failure) => failure === error,
  );
  assert.deepEqual(db.state, { profiles: [], education: [], experience: [] });
});

test("history HTTP requires session and Origin, rejects injected trust and exposes owner-only uncached records", async () => {
  const db = database(),
    profiles = createProfileService({ prisma: db }),
    app = express();
  app.use(express.json());
  const sessions = {
    async authenticate(token) {
      if (!["owner", "other"].includes(token))
        throw Object.assign(new Error("Please log in."), { status: 401 });
      return { account: { person: { id: token } } };
    },
  };
  app.use(
    "/profile",
    createProfileRoutes({
      profiles,
      sessions,
      clientUrl: "http://localhost:5173",
      nodeEnv: "test",
    }),
  );
  app.use((error, req, res, next) => {
    void next;
    res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/profile/me/education`;
  const headers = {
    "Content-Type": "application/json",
    Origin: "http://localhost:5173",
    Cookie: "brightway_session=owner",
  };
  const put = (body, h = headers) =>
    fetch(url, { method: "PUT", headers: h, body: JSON.stringify(body) });
  try {
    assert.equal(
      (
        await put(input([education()]), {
          ...headers,
          Origin: "https://foreign.example",
        })
      ).status,
      403,
    );
    const noOrigin = { ...headers };
    delete noOrigin.Origin;
    assert.equal((await put(input([education()]), noOrigin)).status, 403);
    const noCookie = { ...headers };
    delete noCookie.Cookie;
    assert.equal((await put(input([education()]), noCookie)).status, 401);
    assert.equal(
      (await put(input([education({ status: "VERIFIED" })]))).status,
      400,
    );
    const saved = await put(input([education()]));
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get("cache-control"), "no-store");
    const record = (await saved.json()).data.profile.education.records[0];
    assert.equal(record.profileId, undefined);
    const foreign = await put(input([writable(record)]), {
      ...headers,
      Cookie: "brightway_session=other",
    });
    assert.equal(foreign.status, 404);
    assert.equal(db.state.profiles.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});