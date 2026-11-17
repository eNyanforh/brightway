#!/usr/bin/env node
// Real-institution, READ-ONLY Campus acceptance probe.
// Requires explicit, short-lived sessions for consenting UAT accounts.
// Never create, modify, finalize, revoke, pay, or reconcile real records here.
import assert from "node:assert/strict";

const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required UAT setting: " + name);
  return value;
};
const identifier = name => {
  const value = required(name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Expected a UUID in " + name);
  }
  return value;
};
const cookie = name => {
  const value = required(name);
  if (/[\r\n]/.test(value) || !value.includes("=")) throw new Error("Invalid session Cookie header in " + name);
  return value;
};

async function main() {
  const target = new URL(required("BW_UAT_BASE_URL"));
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/") {
    throw new Error("BW_UAT_BASE_URL must be the origin only, with no credentials or path");
  }
  if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname))) {
    throw new Error("UAT API access requires HTTPS (localhost is allowed for isolated testing)");
  }
  if (required("BW_UAT_READ_ONLY_ACK") !== "I_APPROVE_READ_ONLY_CHECKS") {
    throw new Error("Set BW_UAT_READ_ONLY_ACK=I_APPROVE_READ_ONLY_CHECKS after institution authorization");
  }
  const school = identifier("BW_UAT_SCHOOL_ID");
  const tvet = identifier("BW_UAT_TVET_ID");
  assert.notEqual(school, tvet, "Grade School and TVET must use separate institutions");
  const registration = identifier("BW_UAT_SCHOOL_REGISTRATION_ID");
  const offering = identifier("BW_UAT_SCHOOL_OFFERING_ID");
  const enrolment = identifier("BW_UAT_TVET_ENROLMENT_ID");
  const assignment = identifier("BW_UAT_TVET_ASSIGNMENT_ID");
  const sessions = {
    schoolAdmin: cookie("BW_UAT_SCHOOL_ADMIN_COOKIE"),
    schoolTeacher: cookie("BW_UAT_SCHOOL_TEACHER_COOKIE"),
    schoolLearner: cookie("BW_UAT_SCHOOL_LEARNER_COOKIE"),
    schoolGuardian: cookie("BW_UAT_SCHOOL_GUARDIAN_COOKIE"),
    tvetAdmin: cookie("BW_UAT_TVET_ADMIN_COOKIE"),
    tvetInstructor: cookie("BW_UAT_TVET_INSTRUCTOR_COOKIE"),
    tvetLearner: cookie("BW_UAT_TVET_LEARNER_COOKIE"),
    tvetSupporter: cookie("BW_UAT_TVET_SUPPORTER_COOKIE"),
    outsider: cookie("BW_UAT_OUTSIDER_COOKIE"),
  };
  assert.equal(new Set(Object.values(sessions)).size, 9, "Use nine distinct, authorized UAT sessions");
  const prefix = "/api/v1/organization-workspace/";
  const schoolBase = prefix + school + "/campus";
  const tvetBase = prefix + tvet + "/campus";
  const checks = [];
  async function api(role, pathname, expected) {
    if (!pathname.startsWith("/api/v1/")) throw new Error("Request outside Campus API");
    const response = await fetch(new URL(pathname, target), {
      method: "GET", headers: { Accept: "application/json", Cookie: sessions[role] },
      redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert.ok(allowed.includes(response.status), role + " " + pathname + ": unexpected HTTP " + response.status);
    assert.match(response.headers.get("cache-control") || "", /no-store/i, "Sensitive Campus response must be noncacheable");
    if (expected !== 200) return null;
    const payload = await response.json();
    assert.equal(payload.success, true, "API success envelope");
    return payload.data;
  }
  async function check(name, test) {
    try {
      await test();
      checks.push({ check: name, result: "PASS" });
      console.log("PASS  " + name);
    } catch (error) {
      checks.push({ check: name, result: "FAIL" });
      // Never print private response bodies, account names, cookies, or personal records.
      console.error("FAIL  " + name + ": " + (error instanceof Error ? error.message : "Unexpected error"));
    }
  }
  const verifyBilling = (statement, label) => {
    assert.ok(statement && Array.isArray(statement.charges), label + ": missing statement charges");
    assert.ok(statement.charges.length > 0, label + ": select a UAT institution with billed registrations");
    assert.ok(statement.charges.every(item => item.amountCents === 100), label + ": $1 platform unit invariant");
    assert.ok(Number.isSafeInteger(statement.balanceCents), label + ": invalid ledger balance");
  };

  await check("Grade School: active eligible engine", async () => {
    const info = await api("schoolAdmin", schoolBase, 200);
    assert.equal(info.campus?.engine, "GRADE_SCHOOL");
    assert.equal(info.campus?.status, "ACTIVE");
    assert.equal(info.eligible, true);
  });
  await check("Grade School: administration reads actual periods/sections", async () => {
    const data = await api("schoolAdmin", schoolBase + "/grade-school", 200);
    assert.ok(Array.isArray(data.years) && Array.isArray(data.classes));
  });
  await check("Grade School: teacher assigned offering is accessible", async () => {
    await api("schoolTeacher", schoolBase + "/grade-school/offerings/" + offering, 200);
  });
  await check("Grade School: teacher cannot list registrations", async () => {
    await api("schoolTeacher", schoolBase + "/grade-school/registrations", [403, 404]);
  });
  await check("Grade School: staff report is restricted to administrator", async () => {
    await api("schoolAdmin", schoolBase + "/grade-school/registrations/" + registration + "/report", 200);
    await api("schoolTeacher", schoolBase + "/grade-school/registrations/" + registration + "/report", [403, 404]);
  });
  await check("Grade School: learner views own private record", async () => {
    await api("schoolLearner", "/api/v1/my-campus/registrations/" + registration, 200);
  });
  await check("Grade School: confirmed guardian views authorized record", async () => {
    await api("schoolGuardian", "/api/v1/my-campus/guardians/registrations/" + registration, 200);
  });
  await check("Grade School: $1 charges and statement balance", async () => {
    verifyBilling(await api("schoolAdmin", schoolBase + "/billing", 200), "Grade School");
    await api("schoolTeacher", schoolBase + "/billing", [403, 404]);
  });
  await check("TVET: active eligible engine", async () => {
    const info = await api("tvetAdmin", tvetBase, 200);
    assert.equal(info.campus?.engine, "TVET");
    assert.equal(info.campus?.status, "ACTIVE");
    assert.equal(info.eligible, true);
  });
  await check("TVET: administrator reads programs/intakes/enrolments", async () => {
    const setup = await api("tvetAdmin", tvetBase + "/tvet", 200);
    assert.ok(Array.isArray(setup.programs) && Array.isArray(setup.intakes));
    await api("tvetAdmin", tvetBase + "/tvet/enrolments", 200);
  });
  await check("TVET: instructor accesses own assignment, not enrolment admin", async () => {
    await api("tvetInstructor", tvetBase + "/tvet/assignments/" + assignment, 200);
    await api("tvetInstructor", tvetBase + "/tvet/enrolments", [403, 404]);
  });
  await check("TVET: completion/certificate report is admin-private", async () => {
    const report = await api("tvetAdmin", tvetBase + "/tvet/enrolments/" + enrolment + "/report", 200);
    assert.ok(report.enrolment, "Missing persisted TVET enrolment in report");
    await api("tvetInstructor", tvetBase + "/tvet/enrolments/" + enrolment + "/report", [403, 404]);
  });
  await check("TVET: learner views own private record", async () => {
    await api("tvetLearner", "/api/v1/my-campus/tvet/enrolments/" + enrolment, 200);
  });
  await check("TVET: confirmed supporter views authorized record", async () => {
    await api("tvetSupporter", "/api/v1/my-campus/tvet/supporters/enrolments/" + enrolment, 200);
  });
  await check("TVET: $1 charges and statement balance", async () => {
    verifyBilling(await api("tvetAdmin", tvetBase + "/billing", 200), "TVET");
    await api("tvetInstructor", tvetBase + "/billing", [403, 404]);
  });
  await check("Cross-tenant: outsider cannot read campuses", async () => {
    await api("outsider", schoolBase, [403, 404]);
    await api("outsider", tvetBase, [403, 404]);
  });
  await check("Cross-tenant: outsider cannot read private learner reports", async () => {
    await api("outsider", "/api/v1/my-campus/registrations/" + registration, [403, 404]);
    await api("outsider", "/api/v1/my-campus/tvet/enrolments/" + enrolment, [403, 404]);
  });
  await check("Cross-tenant: outsider cannot read institutional billing", async () => {
    await api("outsider", schoolBase + "/billing", [403, 404]);
    await api("outsider", tvetBase + "/billing", [403, 404]);
  });

  const passed = checks.filter(item => item.result === "PASS").length;
  console.log("Campus UAT read-only: " + passed + "/" + checks.length + " passed. No writes performed.");
  if (passed !== checks.length) process.exitCode = 1;
}
main().catch(error => {
  console.error("UAT setup failed: " + (error instanceof Error ? error.message : "Unknown error"));
  process.exitCode = 1;
});
