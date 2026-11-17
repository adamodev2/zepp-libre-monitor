import test from "node:test";
import assert from "node:assert/strict";
import { glucoseBand, parseGlucoseThresholds, trendArrow } from "../shared/glucose.js";
import { chartSegments, chartStrokePixels } from "../shared/chart.js";

test("default green range is inclusive from 80 to 160 mg/dL", () => {
  const limits = parseGlucoseThresholds(null, null);
  assert.deepEqual(limits, { low: 80, high: 160 });
  assert.equal(glucoseBand(79, limits), "low");
  assert.equal(glucoseBand(80, limits), "target");
  assert.equal(glucoseBand(160, limits), "target");
  assert.equal(glucoseBand(161, limits), "high");
});

test("custom range and reversed limits are handled", () => {
  const custom = parseGlucoseThresholds("90", "170");
  assert.deepEqual(custom, { low: 90, high: 170 });
  assert.equal(glucoseBand(85, custom), "low");
  assert.equal(glucoseBand(150, custom), "target");
  assert.equal(glucoseBand(180, custom), "high");
  assert.deepEqual(parseGlucoseThresholds("175", "90"), { low: 80, high: 160 });
  assert.deepEqual(parseGlucoseThresholds("bad", "160"), { low: 80, high: 160 });
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
