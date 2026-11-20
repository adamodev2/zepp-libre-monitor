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
    [NOW - 180 * 60_000, 110],
    [NOW - 10 * 60_000, 119],
    [NOW - 5 * 60_000, 122],
  ]);
});

test("shared payload rejects invalid glucose", () => {
  assert.equal(createWatchfacePayload({ value: 999, timestamp: NOW, savedAt: NOW }, NOW), null);
  assert.equal(createWatchfacePayload({ value: 100, timestamp: NOW + 120_000, savedAt: NOW }, NOW), null);
});

test("shares at most one actual point per five-minute interval over six hours", () => {
  const history = [];
  for (let minute = 359; minute >= 0; minute--) {
    history.push({ timestamp: NOW - minute * 60_000, value: 100 + minute % 20 });
  }
  const data = createWatchfacePayload({
    timestamp: NOW, savedAt: NOW, value: 100, history,
  }, NOW);
  assert.ok(data.points.length <= 76);
  assert.ok(data.points.some(([time]) => time < NOW - 300 * 60_000));
  assert.ok(data.points.some(([time]) => time > NOW - 5 * 60_000));
});

test("shared record includes the publication timestamp independently from measurement time", () => {
  const result = createWatchfacePayload({
    timestamp: NOW - 10 * 60_000, savedAt: NOW - 30_000, value: 110, history: [],
  }, NOW);
  assert.equal(result.publishedAt, NOW);
  assert.equal(result.timestamp, NOW - 10 * 60_000);
});
