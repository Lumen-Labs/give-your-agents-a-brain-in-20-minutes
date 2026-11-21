import test from "node:test";
import assert from "node:assert/strict";
import { demoFixtures } from "../src/fixtures.mjs";

function desk(jurisdictionId) {
  return {
    firmBrainId: "firmdesk",
    jurisdictionBrainId: jurisdictionId === "sanfrancisco" ? "jursfca" : "jdemolocal",
    jurisdictionId,
  };
}

test("demolocal seeds the firm policy and the sample rule", () => {
  const fixtures = demoFixtures(desk("demolocal"));
  assert.deepEqual(fixtures.map((item) => item.sourceKey), ["engpolicy1", "locrule14aa"]);
  assert.equal(fixtures[1].brainId, "jdemolocal");
  assert.equal(fixtures[1].jurisdictionId, "demolocal");
});

test("sanfrancisco seeds the firm policy only", () => {
  const fixtures = demoFixtures(desk("sanfrancisco"));
  assert.deepEqual(fixtures.map((item) => item.sourceKey), ["engpolicy1"]);
  assert.equal(fixtures[0].brainId, "firmdesk");
  assert.equal(fixtures.some((item) => item.brainRole === "jurisdiction"), false);
});
