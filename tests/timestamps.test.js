import test from "node:test";
import assert from "node:assert/strict";
import { parseFactoryTimestamp } from "../app-side/timestamps.js";

test("LibreLinkUp UTC dates parse independently of local timezone", () => {
  assert.equal(parseFactoryTimestamp("11/3/2026 8:10:15 PM"), Date.parse("2026-11-03T20:10:15Z"));
  assert.equal(parseFactoryTimestamp("11/3/2026 20:10:15"), Date.parse("2026-11-03T20:10:15Z"));
  assert.equal(parseFactoryTimestamp("11/03/2026 08:10:15 PM"), Date.parse("2026-11-03T20:10:15Z"));
  assert.equal(parseFactoryTimestamp("11/3/2026 12:00:00 AM"), Date.parse("2026-11-03T00:00:00Z"));
  assert.equal(parseFactoryTimestamp("11/3/2026 12:00:00 PM"), Date.parse("2026-11-03T12:00:00Z"));
});
test("UTC ISO timestamp is supported for synthetic and historical responses", () => {
  assert.equal(parseFactoryTimestamp("2026-11-03T20:10:15Z"), Date.parse("2026-11-03T20:10:15Z"));
  assert.equal(parseFactoryTimestamp("2026-11-03T20:10:15"), Date.parse("2026-11-03T20:10:15Z"));
});
test("invalid and ambiguous timestamps are rejected instead of treated as fresh", () => {
  assert.equal(parseFactoryTimestamp(""), 0);
  assert.equal(parseFactoryTimestamp(undefined), 0);
  assert.equal(parseFactoryTimestamp("13/3/2026 20:10:15"), 0);
  assert.equal(parseFactoryTimestamp("2/30/2026 20:10:15"), 0);
  assert.equal(parseFactoryTimestamp("03/11/2026"), 0);
});
