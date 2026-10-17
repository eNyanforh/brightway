import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { profilePatchSchema } from "../src/modules/profile/profile.schema.js";
import {
  ownerContactView,
  projectContact,
  createContactReader,
} from "../src/modules/profile/profile-contact.js";
import { createProfileRoutes } from "../src/modules/profile/profile.routes.js";

const contact = {
  email: "owner@example.com",
  phoneNumber: "+231770000000",
  whatsappNumber: "+231880000000",
  visibility: { email: "PUBLIC", phone: "CONNECTIONS", whatsapp: "ONLY_ME" },
};
const account = {
  email: contact.email,
  status: "ACTIVE",
  person: {
    id: "owner",
    phoneNumber: contact.phoneNumber,
    profile: {
      whatsappNumber: contact.whatsappNumber,
      emailVisibility: "PUBLIC",
      phoneVisibility: "CONNECTIONS",
      whatsappVisibility: "ONLY_ME",
    },
  },
};
const database = () => ({
  account: {
    async findUnique() {
      return structuredClone(account);
    },
  },
});

test("contact validation normalizes international numbers, permits incomplete drafts and rejects email/trust injection", () => {
  const parsed = profilePatchSchema.parse({
    expectedVersion: 0,
    changes: {
      contact: {
        phoneNumber: "+231 (77) 000-0000",
        whatsappNumber: "",
        visibility: { email: "PUBLIC", phone: "CONNECTIONS" },
      },
    },
  });
  assert.equal(parsed.changes.contact.phoneNumber, "+231770000000");
  assert.equal(parsed.changes.contact.whatsappNumber, null);
  for (const contact of [
    {},
    { email: "attacker@example.com" },
    { phoneNumber: "0770000000" },
    { phoneNumber: "+0123456789" },
    { phoneNumber: "+231abc" },
    { phoneNumber: "+1234567890123456" },
    { visibility: {} },
    { visibility: { email: "FRIENDS" } },
    { visibility: { owner: true } },
    { connected: true },
  ]) {
    assert.equal(
      profilePatchSchema.safeParse({ expectedVersion: 0, changes: { contact } })
        .success,
      false,
    );
  }
  assert(
    profilePatchSchema.safeParse({
      expectedVersion: 0,
      changes: { contact: { phoneNumber: null } },
    }).success,
  );
});

test("contact projection filters per-field visibility and never treats arbitrary truthy values as accepted connections", () => {
  assert.deepEqual(projectContact(contact), { email: contact.email });
  assert.deepEqual(projectContact(contact, { connected: true }), {
    email: contact.email,
    phoneNumber: contact.phoneNumber,
  });
  assert.deepEqual(projectContact(contact, { connected: "true" }), {
    email: contact.email,
  });
  assert.deepEqual(projectContact(contact, { owner: true }), {
    email: contact.email,
    phoneNumber: contact.phoneNumber,
    whatsappNumber: contact.whatsappNumber,
  });
  assert.deepEqual(
    projectContact(contact, { connected: true, blocked: true }),
    {},
  );
  assert.deepEqual(ownerContactView(null).visibility, {
    email: "ONLY_ME",
    phone: "ONLY_ME",
    whatsapp: "ONLY_ME",
  });
});

test("contact reader uses server identity and defaults to no connections until the relationship service exists", async () => {
  const prisma = database();
  const read = createContactReader({ prisma });
  assert.deepEqual(await read("owner"), { email: contact.email });
  assert.deepEqual(await read("owner", "other"), { email: contact.email });
  assert.equal(
    (await read("owner", "owner")).whatsappNumber,
    contact.whatsappNumber,
  );
  const connected = createContactReader({
    prisma,
    relationshipFor: async (viewer, owner) => {
      assert.equal(viewer, "other");
      assert.equal(owner, "owner");
      return { connected: true, blocked: false };
    },
  });
  assert.equal(
    (await connected("owner", "other")).phoneNumber,
    contact.phoneNumber,
  );
  const blocked = createContactReader({
    prisma,
    relationshipFor: async () => ({ connected: true, blocked: true }),
  });
  assert.deepEqual(await blocked("owner", "other"), {});
  prisma.account.findUnique = async () => ({ ...account, status: "SUSPENDED" });
  await assert.rejects(read("owner"), { status: 404 });
});

test("contact HTTP ignores forged relationship flags, filters anonymous reads, and authenticates supplied cookies", async () => {
  const app = express(),
    prisma = database();
  app.use(express.json());
  const sessions = {
    async authenticate(token) {
      if (!["owner-token", "other-token"].includes(token))
        throw Object.assign(new Error("Sign in again."), { status: 401 });
      return {
        account: {
          person: { id: token === "owner-token" ? "owner" : "other" },
        },
      };
    },
  };
  const profiles = { visibleContact: createContactReader({ prisma }) };
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
  const url = `http://127.0.0.1:${server.address().port}/profile/owner/contact`;
  try {
    const anonymous = await fetch(
      url + "?connected=true&owner=true&personId=owner",
    );
    assert.equal(anonymous.headers.get("cache-control"), "no-store");
    assert.deepEqual((await anonymous.json()).data.contact, {
      email: contact.email,
    });
    const other = await fetch(url, {
      headers: { Cookie: "brightway_session=other-token" },
    });
    assert.deepEqual((await other.json()).data.contact, {
      email: contact.email,
    });
    const owner = await fetch(url, {
      headers: { Cookie: "brightway_session=owner-token" },
    });
    assert.equal(
      (await owner.json()).data.contact.whatsappNumber,
      contact.whatsappNumber,
    );
    assert.equal(
      (await fetch(url, { headers: { Cookie: "brightway_session=expired" } }))
        .status,
      401,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connected: true }),
        })
      ).status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});