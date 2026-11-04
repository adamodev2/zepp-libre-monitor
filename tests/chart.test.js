import test from "node:test";
import assert from "node:assert/strict";
import { chartSegments } from "../shared/chart.js";
import { parseHistory } from "../app-side/librelinkup.js";

test("two-hour mode keeps one latest real point per five-minute bucket", () => {
  const graph = chartSegments([
    { ageMinutes: 120, value: 100 },
    { ageMinutes: 119, value: 101 },
    { ageMinutes: 118, value: 102 },
    { ageMinutes: 5, value: 110 },
    { ageMinutes: 4, value: 112 },
    { ageMinutes: 0, value: 115 },
  ], 120, 241, 91);
  assert.equal(graph.count, 4);
  assert.deepEqual(graph.dots.map((point) => point.x), [0, 4, 232, 240]);
});

test("six-hour mode includes older samples that two-hour mode hides", () => {
  const points = [
    { ageMinutes: 300, value: 95 },
    { ageMinutes: 120, value: 105 },
    { ageMinutes: 0, value: 115 },
  ];
  assert.equal(chartSegments(points, 360, 260, 92).count, 3);
  assert.equal(chartSegments(points, 120, 260, 92).count, 2);
});

test("connecting sparse 15-minute Abbott readings creates a continuous native polyline", () => {
  const graph = chartSegments([
    { ageMinutes: 60, value: 105 },
    { ageMinutes: 45, value: 110 },
    { ageMinutes: 30, value: 115 },
    { ageMinutes: 15, value: 125 },
    { ageMinutes: 0, value: 120 },
  ], 120, 260, 92);
  assert.equal(graph.count, 5);
  assert.equal(graph.lines.length, 4);
  assert.equal(graph.segments.length, 1);
  assert.equal(graph.segments[0].length, 5);
});

test("chart never bridges missing data beyond twenty minutes", () => {
  const graph = chartSegments([
    { ageMinutes: 90, value: 100 },
    { ageMinutes: 80, value: 125 },
    { ageMinutes: 45, value: 120 },
    { ageMinutes: 30, value: 115 },
  ], 120, 260, 92);
  assert.equal(graph.count, 4);
  assert.equal(graph.lines.length, 2);
  assert.deepEqual(graph.segments.map((segment) => segment.length), [2, 2]);
});

test("one point remains visible without a connecting line", () => {
  const graph = chartSegments([{ ageMinutes: 20, value: 110 }], 120, 260, 92);
  assert.equal(graph.dots.length, 1);
  assert.equal(graph.segments.length, 0);
});

test("Abbott graph history includes six hours but excludes older records", () => {
  const now = Date.parse("2026-11-03T21:00:00Z");
  const graph = parseHistory([
    { FactoryTimestamp: "11/3/2026 8:58:00 PM", ValueInMgPerDl: 115 },
    { FactoryTimestamp: "11/3/2026 8:58:22 PM", ValueInMgPerDl: 116 },
    { FactoryTimestamp: "11/3/2026 6:00:00 PM", ValueInMgPerDl: 98 },
    { FactoryTimestamp: "11/3/2026 2:00:00 PM", ValueInMgPerDl: 88 },
    { FactoryTimestamp: "11/3/2026 8:59:00 PM", ValueInMgPerDl: 120 },
    { FactoryTimestamp: "no date", ValueInMgPerDl: 130 },
  ], now);
  assert.deepEqual(graph.map((point) => point.value), [98, 116, 120]);
});

test("invalid chart ranges return a safe empty dataset", () => {
  assert.equal(chartSegments([], 60, 260, 92).count, 0);
  assert.equal(chartSegments(null, 120, 260, 92).count, 0);
});
