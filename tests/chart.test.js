import test from "node:test";
import assert from "node:assert/strict";
import { chartSegments, chartStrokePixels } from "../shared/chart.js";
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
  assert.deepEqual(graph.dots.map((point) => point.x), [0, 4, 230, 240]);
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

test("stroke pixels and glucose dots use identical screen-space coordinates", () => {
  const graph = chartSegments([
    { ageMinutes: 20, value: 80 },
    { ageMinutes: 15, value: 155 },
  ], 120, 260, 92);
  assert.equal(graph.lines.length, 1);
  const stroke = chartStrokePixels(graph.lines);
  assert.ok(stroke.length > 0);
  const start = graph.dots[0];
  const end = graph.dots[1];
  // Screen-space raster points remain on the measured straight segment.
  for (const point of stroke) {
    assert.ok(point.x >= start.x && point.x <= end.x);
    assert.ok(point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y));
    const ratio = (point.x - start.x) / (end.x - start.x);
    const expectedY = start.y + (end.y - start.y) * ratio;
    assert.ok(Math.abs(point.y - expectedY) <= 3, "stroke must meet the sample dots");
  }
});

test("stroke respects missing-data breaks and never links disconnected dots", () => {
  const graph = chartSegments([
    { ageMinutes: 120, value: 90 },
    { ageMinutes: 110, value: 100 },
    { ageMinutes: 60, value: 150 },
    { ageMinutes: 50, value: 170 },
  ], 120, 260, 92);
  assert.equal(graph.lines.length, 2);
  const stroke = chartStrokePixels(graph.lines);
  const disconnectedX1 = graph.dots[1].x;
  const disconnectedX2 = graph.dots[2].x;
  assert.ok(stroke.every((pixel) => pixel.x <= disconnectedX1 || pixel.x >= disconnectedX2));
});

test("stroke renderer limits pixel widget count on dense charts", () => {
  const lines = Array.from({ length: 70 }, (_, index) => ({
    x1: index * 3, y1: index % 2 ? 0 : 90,
    x2: index * 3 + 3, y2: index % 2 ? 90 : 0,
  }));
  assert.ok(chartStrokePixels(lines, 160).length <= 160);
});

test("latest real glucose point bridges a moderate 25-minute graph lag", () => {
  const graph = chartSegments([
    { ageMinutes: 55, value: 117 },
    { ageMinutes: 30, value: 119 },
    { ageMinutes: 25, value: 121 },
    { ageMinutes: 0, value: 126 },
  ], 120, 260, 92);
  assert.equal(graph.tailGapMinutes, 25);
  assert.equal(graph.dots.length, 4);
  assert.equal(graph.lines.length, 2);
  assert.equal(graph.lines[1].dashed, true);
  const latestLine = graph.lines[1];
  assert.deepEqual(
    { x: latestLine.x2, y: latestLine.y2 },
    graph.dots[graph.dots.length - 1],
    "the connector must terminate exactly at the current glucose marker",
  );
  assert.ok(chartStrokePixels([latestLine], 25).length > 0);
});

test("an actual long gap never becomes a fabricated solid glucose trace", () => {
  const graph = chartSegments([
    { ageMinutes: 55, value: 95 },
    { ageMinutes: 40, value: 105 },
    { ageMinutes: 2, value: 120 },
  ], 120, 260, 92);
  assert.equal(graph.tailGapMinutes, 38);
  assert.equal(graph.lines.length, 1);
  assert.equal(graph.lines[0].dashed, false);
  assert.equal(graph.dots.length, 3);
});

test("bridging is restricted to a fresh final sample, not a historic gap", () => {
  const graph = chartSegments([
    { ageMinutes: 115, value: 95 },
    { ageMinutes: 90, value: 105 },
    { ageMinutes: 75, value: 115 },
    { ageMinutes: 60, value: 110 },
  ], 120, 260, 92);
  assert.equal(graph.tailGapMinutes, 0);
  assert.equal(graph.lines.length, 2);
  assert.ok(graph.lines.every((line) => !line.dashed));
});

test("late current measurement is not connected if its freshness exceeds fifteen minutes", () => {
  const graph = chartSegments([
    { ageMinutes: 51, value: 95 },
    { ageMinutes: 20, value: 110 },
  ], 120, 260, 92);
  assert.equal(graph.tailGapMinutes, 0);
  assert.equal(graph.lines.length, 0);
});
