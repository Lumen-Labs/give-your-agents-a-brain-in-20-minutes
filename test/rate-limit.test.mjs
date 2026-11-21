import assert from "node:assert/strict";
import test from "node:test";
import { allow, clientAddress, resetLimits } from "../src/rate-limit.mjs";

test("a network can ask for six drafts an hour", () => {
  resetLimits();
  const start = 1_700_000_000_000;
  for (let count = 0; count < 6; count += 1) {
    assert.equal(allow("203.0.113.8", "draft", start).ok, true);
  }
  const blocked = allow("203.0.113.8", "draft", start + 1000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfter > 0, true);
  assert.equal(allow("203.0.113.9", "draft", start).ok, true);
  assert.equal(allow("203.0.113.8", "draft", start + 60 * 60_000).ok, true);
});

test("document saves stop at four an hour for one network", () => {
  resetLimits();
  const start = 1_700_000_000_000;
  for (let count = 0; count < 4; count += 1) assert.equal(allow("198.51.100.4", "ingest", start).ok, true);
  assert.equal(allow("198.51.100.4", "ingest", start).ok, false);
});

test("the whole demo stops drafts after the shared ceiling", () => {
  resetLimits();
  const start = 1_700_000_000_000;
  for (let count = 0; count < 30; count += 1) {
    assert.equal(allow(`203.0.113.${count}`, "draft", start).ok, true);
  }
  const blocked = allow("203.0.113.200", "draft", start);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /demo is busy/);
});

test("requests from this computer are not limited", () => {
  resetLimits();
  assert.equal(allow("", "ingest").ok, true);
  assert.equal(
    clientAddress({ socket: { remoteAddress: "127.0.0.1" }, headers: {} }),
    "",
  );
});

test("the address behind the local proxy is the client", () => {
  assert.equal(
    clientAddress({
      socket: { remoteAddress: "::ffff:127.0.0.1" },
      headers: { "x-forwarded-for": "198.51.100.20, 203.0.113.5" },
    }),
    "203.0.113.5",
  );
  assert.equal(
    clientAddress({ socket: { remoteAddress: "198.51.100.7" }, headers: { "x-forwarded-for": "1.2.3.4" } }),
    "198.51.100.7",
  );
});
