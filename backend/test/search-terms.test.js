import assert from "node:assert/strict";
import { test } from "node:test";
import { directoryFuzzyTerm, prefixSearchQuery } from "../src/modules/search/search-terms.js";

test("natural phrases keep meaningful words for prefix search", () => {
  assert.equal(prefixSearchQuery("find me people with Python in Monrovia"), "Python:* & Monrovia:*");
  assert.equal(prefixSearchQuery("show me events about robotics"), "robotics:*");
  assert.equal(prefixSearchQuery("software engineer"), "software:* & engineer:*");
});

test("short input, excessive terms and punctuation do not create unrestricted searches", () => {
  assert.equal(prefixSearchQuery("!"), null);
  assert.equal(prefixSearchQuery("x"), null);
  assert.equal(prefixSearchQuery("a b c d e f g h i"), null);
  assert.equal(prefixSearchQuery("@maya"), "maya:*");
  assert.equal(prefixSearchQuery("the"), "the:*");
});


test("fuzzy name search accepts misspellings, fragments and @handles but never emails", () => {
  assert.equal(prefixSearchQuery("Ma"), "Ma:*");
  assert.equal(directoryFuzzyTerm("Ma"), null);
  assert.equal(directoryFuzzyTerm("Emmanul"), "emmanul");
  assert.equal(directoryFuzzyTerm("Mya Cole"), "mya cole");
  assert.equal(directoryFuzzyTerm("@nyanfrh"), "nyanfrh");
  assert.equal(directoryFuzzyTerm("find someone named Emmanuel"), "named emmanuel");
  assert.equal(directoryFuzzyTerm("owner_person@example.invalid"), null);
  assert.equal(directoryFuzzyTerm("x') OR 1=1 --"), null);
});
