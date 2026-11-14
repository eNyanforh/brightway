import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInput } from "../src/modules/opportunities/opportunity.schema.js";
import { challengeCardPrize, challengePrizeValue } from "../../shared/challenges.mjs";

const validListing = prizes => ({
  type: "CHALLENGE",
  title: "Community technology competition",
  description: "Create an original innovation that improves learning for students.",
  location: "BrightWay",
  workMode: "REMOTE",
  deadline: "2099-12-01T12:00:00Z",
  questions: [],
  requestKey: randomUUID(),
  prizes,
});

const awards = [
  { type: "CASH", amount: 500, currency: "LRD" },
  { type: "SCHOLARSHIP", coverage: "Full tuition", institution: "BrightWay Academy" },
  { type: "CERTIFICATE", title: "Innovation Award", issuer: "Research School" },
  { type: "MENTORSHIP", focus: "Entrepreneurship", sessions: 6 },
  { type: "EQUIPMENT", item: "Laptop", quantity: 2 },
  { type: "INTERNSHIP", role: "Software Engineer Intern", duration: "3 months" },
  { type: "OTHER", title: "Innovation package", details: "Learning resources" },
];

test("each Challenge prize type validates its own fields", () => {
  for (const award of awards) {
    const parsed = createInput.safeParse(validListing([award]));
    assert.equal(parsed.success, true,
      `Expected valid ${award.type}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`);
    assert.deepEqual(parsed.data.prizes, [award]);
    assert(challengePrizeValue(award).length > 0);
  }
});

test("structured prizes reject missing, invalid or cross-type fields", () => {
  const invalid = [
    { type: "CASH", amount: 500 },
    { type: "CASH", amount: 0, currency: "USD" },
    { type: "CASH", amount: -10, currency: "LRD" },
    { type: "CASH", amount: 500, currency: "INVALID" },
    { type: "CASH", amount: 500, currency: "USD", description: "Untrusted override" },
    { type: "SCHOLARSHIP", coverage: "", institution: "" },
    { type: "CERTIFICATE", title: "A", issuer: "" },
    { type: "MENTORSHIP", focus: "Growth", sessions: 0 },
    { type: "MENTORSHIP", focus: "Growth", sessions: 1.5 },
    { type: "EQUIPMENT", item: "Camera", quantity: -2 },
    { type: "INTERNSHIP", role: "Researcher", duration: "" },
    { type: "OTHER", title: "Gift", details: "" },
    { type: "SCHOLARSHIP", coverage: "Full", institution: "", amount: 300 },
  ];
  for (const item of invalid) {
    assert.equal(createInput.safeParse(validListing([item])).success, false,
      `Invalid ${item.type} award must be rejected: ${JSON.stringify(item)}`);
  }
});

test("Challenge card displays prize values without prize types or native-mode labels", () => {
  assert.equal(challengeCardPrize({ prizes: [awards[0]] }), "LRD 500");
  assert.equal(challengeCardPrize({ prizes: [awards[0], awards[1]] }), "LRD 500 + 1 more prize");
  assert.equal(challengeCardPrize({ prizes: [awards[0], awards[1], awards[2]] }), "LRD 500 + 2 more prizes");
  assert.equal(challengeCardPrize({ prizes: [{ type: "CASH", description: "US$1,000" }] }), "US$1,000");
  assert.equal(challengeCardPrize({ prize: "Cash: US$500 · Certificate: Participation" }), "US$500");
  assert.equal(challengeCardPrize({ prize: "Full scholarship" }), "Full scholarship");
  assert.equal(challengeCardPrize({ prizes: [] }), "To be announced");
});

test("old descriptions remain valid for existing published Challenges", () => {
  const legacy = { type: "CASH", description: "US$500" };
  assert.equal(createInput.safeParse(validListing([legacy])).success, true);
  assert.equal(challengePrizeValue(legacy), "US$500");
});
