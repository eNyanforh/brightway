import assert from "node:assert/strict";
import test from "node:test";
import { registrationSchema } from "../src/modules/auth/registration.schema.js";
import { memberProfilePath, reservedMemberHandles } from "../../shared/member-profile-paths.mjs";

const valid = {
  photoAssetId: "11111111-1111-4111-8111-111111111111",
  firstName: "Synthetic",
  lastName: "Member",
  gender: "OTHER",
  birthDate: "2000-01-01",
  countryCode: "LR",
  username: "synthetic_user",
  email: "synthetic@example.invalid",
  password: "a very long password",
};

test("member root URLs are canonical and application routes stay reserved", () => {
  assert.equal(memberProfilePath("maya"), "/maya");
  assert.equal(memberProfilePath("some_name"), "/some_name");
  for (const handle of ["profile", "login", "register", "search", "network",
    "notifications", "opportunities", "learning", "posts", "work", "security",
    "help", "admin", "management", "superadmin", "organizations", "people"]) {
    assert.ok(reservedMemberHandles.has(handle));
    const parsed = registrationSchema.safeParse({ ...valid, username: handle });
    assert.equal(parsed.success, false, handle + " should not be registered");
  }
  assert.equal(registrationSchema.safeParse(valid).success, true);
  assert.equal(registrationSchema.safeParse({ ...valid, username: "Maya_User" }).data.username, "maya_user");
});
