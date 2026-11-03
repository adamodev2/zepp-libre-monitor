import test from "node:test";
import assert from "node:assert/strict";
import { chartSegments } from "../shared/chart.js";
import { parseHistory } from "../app-side/librelinkup.js";

test("chart places 1-minute observations on corresponding horizontal positions", () => {
  const graph = chartSegments([
    { ageMinutes: 120, value: 100 },
    { ageMinutes: 119, value: 101 },
    { ageMinutes: 0, value: 115 },
  ], 120, 241, 91);
  assert.equal(graph.count, 3);
  assert.equal(graph.dots[0].x, 0);
  assert.equal(graph.dots[1].x, 2);
  assert.equal(graph.dots[2].x, 240);
  assert.equal(graph.lines.length, 1);
});

test("chart never bridges gaps greater than five minutes", () => {
  const graph = chartSegments([
    { ageMinutes: 20, value: 100 },
    { ageMinutes: 10, value: 125 },
  ], 60, 241, 91);
  assert.equal(graph.lines.length, 0);
});

test("one-hour mode excludes older samples", () => {
  const graph = chartSegments([
    { ageMinutes: 75, value: 100 },
    { ageMinutes: 32, value: 110 },
  ], 60, 241, 91);
  assert.equal(graph.count, 1);
});

test("Abbott graph points are deduplicated by minute and filtered to two hours", () => {
  const now = Date.parse("2026-11-03T21:00:00Z");
  const graph = parseHistory([
    { FactoryTimestamp: "11/3/2026 8:58:00 PM", ValueInMgPerDl: 115 },
    { FactoryTimestamp: "11/3/2026 8:58:22 PM", ValueInMgPerDl: 116 },
    { FactoryTimestamp: "11/3/2026 6:00:00 PM", ValueInMgPerDl: 98 },
    { FactoryTimestamp: "11/3/2026 8:59:00 PM", ValueInMgPerDl: 120 },
    { FactoryTimestamp: "no date", ValueInMgPerDl: 130 },
  ], now);
  assert.deepEqual(graph.map((p) => p.value), [116, 120]);
});
