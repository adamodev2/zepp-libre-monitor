import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGlucoseSnapshot, readingColor, chartCoordinates, linePixels,
} from "../lib/model.js";

const NOW = Date.parse("2026-11-18T12:00:00Z");

test("parses glucose and computes measurement age", () => {
  const data = JSON.stringify({
    version: 1, timestamp: NOW - 18 * 60_000, value: 125, trend: 4,
    points: [[NOW - 15 * 60_000, 120], [NOW - 10 * 60_000, 123]],
  });
  const reading = parseGlucoseSnapshot(data, NOW);
  assert.equal(reading.value, 125);
  assert.equal(reading.ageMinutes, 18);
  assert.equal(readingColor(reading), 0x8b97a4);
});

test("does not fabricate missing history or stale measurements", () => {
  assert.equal(parseGlucoseSnapshot("not-json", NOW), null);
  assert.equal(parseGlucoseSnapshot(JSON.stringify({
    version: 1, timestamp: NOW - 7 * 60 * 60_000, value: 120,
  }), NOW), null);

  const reading = parseGlucoseSnapshot({
    version: 1, timestamp: NOW - 60_000, value: 110, points: [
      [NOW - 30 * 60_000, 100],
      [NOW - 25 * 60_000, 105],
      [NOW - 5 * 60_000, 115],
    ],
  }, NOW);
  const coords = chartCoordinates(reading, NOW, 300, 80);
  assert.equal(coords.length, 3);
  const pixels = linePixels(coords);
  assert.ok(pixels.every((p) => p.x >= 0 && p.x < 300));
  assert.ok(!pixels.some((p) => p.x > coords[1].x + 12 && p.x < coords[2].x - 12));
});

test("chart supports 2h and 6h using the same real points", () => {
  const reading = parseGlucoseSnapshot({
    version: 1, timestamp: NOW, value: 120, points: [
      [NOW - 300 * 60_000, 110],
      [NOW - 30 * 60_000, 120],
      [NOW - 5 * 60_000, 125],
    ],
  }, NOW);
  assert.equal(chartCoordinates(reading, NOW, 300, 80, 120).length, 2);
  assert.equal(chartCoordinates(reading, NOW, 300, 80, 360).length, 3);
});
