import test from "node:test";
import assert from "node:assert/strict";
import { createWatchfacePayload } from "../shared/watchface-data.js";

const NOW = Date.parse("2026-11-18T12:00:00Z");

test("shared payload includes real glucose and recent history only", () => {
  const snapshot = {
    timestamp: NOW - 120_000, savedAt: NOW,
    value: 123, trend: 4,
    thresholds: { low: 80, high: 160, veryLow: 70, veryHigh: 240 },
    history: [
      { timestamp: NOW - 180 * 60_000, value: 110 },
      { timestamp: NOW - 10 * 60_000, value: 119 },
      { timestamp: NOW - 5 * 60_000, value: 122 },
    ],
  };
  const result = createWatchfacePayload(snapshot, NOW);
  assert.equal(result.version, 1);
  assert.equal(result.value, 123);
  assert.equal(result.trend, 4);
  assert.equal(result.low, 80);
  assert.deepEqual(result.points, [
    [NOW - 10 * 60_000, 119],
    [NOW - 5 * 60_000, 122],
  ]);
});

test("shared payload rejects invalid glucose", () => {
  assert.equal(createWatchfacePayload({ value: 999, timestamp: NOW, savedAt: NOW }, NOW), null);
  assert.equal(createWatchfacePayload({ value: 100, timestamp: NOW + 120_000, savedAt: NOW }, NOW), null);
});
