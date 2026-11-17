import test from "node:test";
import assert from "node:assert/strict";
import { glucoseBand, parseGlucoseThresholds, trendArrow } from "../shared/glucose.js";
import { chartSegments, chartStrokePixels } from "../shared/chart.js";

test("defaults define red, yellow and green thresholds with exact boundaries", () => {
  const limits = parseGlucoseThresholds(null, null);
  assert.deepEqual(limits, { veryLow: 70, low: 80, high: 160, veryHigh: 240 });
  for (const [value, expected] of [
    [69, "very-low"], [70, "low"], [79, "low"],
    [80, "target"], [160, "target"],
    [161, "high"], [240, "high"], [241, "very-high"],
  ]) {
    assert.equal(glucoseBand(value, limits), expected);
  }
});

test("custom extreme thresholds and invalid settings are handled", () => {
  const custom = parseGlucoseThresholds("90", "170", "65", "250");
  assert.deepEqual(custom, { veryLow: 65, low: 90, high: 170, veryHigh: 250 });
  assert.equal(glucoseBand(64, custom), "very-low");
  assert.equal(glucoseBand(85, custom), "low");
  assert.equal(glucoseBand(150, custom), "target");
  assert.equal(glucoseBand(180, custom), "high");
  assert.equal(glucoseBand(251, custom), "very-high");
  const defaults = parseGlucoseThresholds();
  assert.deepEqual(parseGlucoseThresholds("175", "90", 70, 240), defaults);
  assert.deepEqual(parseGlucoseThresholds("bad", "160", 70, 240), defaults);
  assert.deepEqual(parseGlucoseThresholds(80, 160, 80, 240), defaults);
  assert.deepEqual(parseGlucoseThresholds(80, 160, 70, 160), defaults);
  assert.deepEqual(parseGlucoseThresholds(80, 160, 70, 401), defaults);
});

test("chart retains exact observed values for both dots and line pixels", () => {
  const graph = chartSegments([
    { ageMinutes: 60, value: 70 },
    { ageMinutes: 45, value: 100 },
    { ageMinutes: 30, value: 170 },
  ], 120, 260, 92);
  assert.deepEqual(graph.dots.map((dot) => dot.value), [70, 100, 170]);
  const pixels = chartStrokePixels(graph.lines);
  assert.ok(pixels.length > 0);
  assert.ok(pixels.every((pixel) => Number.isFinite(pixel.value)));
  assert.ok(pixels.some((pixel) => pixel.value > 80 && pixel.value < 160));
});

test("existing trend arrows remain unchanged", () => {
  assert.equal(trendArrow(1), "↓");
  assert.equal(trendArrow(3), "→");
  assert.equal(trendArrow(5), "↑");
});
