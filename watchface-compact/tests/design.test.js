import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FACE_SIZE, CHART_MINUTES, PANEL, GRAPH, HEART_PILL, BATTERY_PILL,
  GLUCOSE_TEXT, TREND_ARROW,
  formatFaceDate, formatFaceTime, glucoseAgeLabel, isChartGap,
} from "../lib/design.js";
import {
  parseGlucoseSnapshot, chooseSharedSnapshot, chartCoordinates, readingColor,
} from "../lib/model.js";
import { isHeartRateDisplayable, MIN_WEAR_DURATION_MS } from "../lib/heart-confidence.js";

const NOW = Date.parse("2026-11-19T12:03:00Z");

test("all design elements fit inside a round 466px watch", () => {
  const withinRound = (x, y) => {
    const dx = x - FACE_SIZE / 2, dy = y - FACE_SIZE / 2;
    return dx * dx + dy * dy <= (FACE_SIZE / 2) ** 2;
  };
  for (const rect of [PANEL, HEART_PILL, BATTERY_PILL]) {
    assert.ok(withinRound(rect.x, rect.y + rect.h / 2));
    assert.ok(withinRound(rect.x + rect.w, rect.y + rect.h / 2));
  }
  assert.ok(GRAPH.x >= PANEL.x && GRAPH.x + GRAPH.w <= PANEL.x + PANEL.w);
  assert.ok(GRAPH.y >= PANEL.y && GRAPH.y + GRAPH.h <= PANEL.y + PANEL.h);
  assert.equal(CHART_MINUTES, 120);
  assert.equal(TREND_ARROW.centerY, GLUCOSE_TEXT.y + GLUCOSE_TEXT.h / 2);
  assert.ok(TREND_ARROW.halfLength >= 16);
  assert.ok(GRAPH.x - (TREND_ARROW.centerX + TREND_ARROW.halfLength) <= 16,
    "Sparkline must begin immediately after the trend arrow");
  assert.ok(GRAPH.x > TREND_ARROW.centerX + TREND_ARROW.halfLength);
  assert.ok(GRAPH.w >= 160, "Sparkline must use the remaining panel width");
  assert.ok(GRAPH.x + GRAPH.w <= PANEL.x + PANEL.w - 10);
});

test("date, time and data age are formatted from real timestamps", () => {
  const date = new Date(2026, 10, 19, 2, 9).getTime();
  assert.equal(formatFaceDate(date), "THU 19 NOV");
  assert.equal(formatFaceTime(date), "02:09");
  assert.equal(glucoseAgeLabel(null), "NO DATA");
  assert.equal(glucoseAgeLabel({ ageMinutes: 3 }), "3 min");
  assert.equal(glucoseAgeLabel({ ageMinutes: 16 }), "STALE 16m");
});

test("sparkline uses real two-hour history and leaves gaps disconnected", () => {
  const reading = parseGlucoseSnapshot({
    version: 1, timestamp: NOW - 3 * 60_000, value: 118, trend: 3,
    points: [
      [NOW - 150 * 60_000, 100],
      [NOW - 55 * 60_000, 103],
      [NOW - 50 * 60_000, 107],
      [NOW - 12 * 60_000, 117],
      [NOW - 3 * 60_000, 118],
    ],
  }, NOW);
  const points = chartCoordinates(reading, NOW, GRAPH.w, GRAPH.h, CHART_MINUTES);
  assert.equal(points.length, 4);
  assert.equal(isChartGap(points[0], points[1]), false);
  assert.equal(isChartGap(points[1], points[2]), true);
  assert.equal(isChartGap(points[2], points[3]), false);
  assert.equal(readingColor(reading), 0x41d98a);
});

test("the age caption tracks the same measurement timestamp as Mini App LIVE", () => {
  const publishedAt = NOW - 30_000;
  const measuredAt = NOW - 5 * 60_000;
  const reading = {
    version: 1, timestamp: measuredAt, publishedAt,
    value: 118, trend: 3, points: [],
  };
  const first = parseGlucoseSnapshot(reading, NOW);
  assert.equal(glucoseAgeLabel(first), "5 min");
  assert.equal(first.publishAgeMinutes, 0);
  const later = parseGlucoseSnapshot(reading, NOW + 2 * 60_000);
  assert.equal(glucoseAgeLabel(later), "7 min");
  assert.equal(later.publishAgeMinutes, 2);
  assert.equal(glucoseAgeLabel(parseGlucoseSnapshot(reading,
    NOW + 11 * 60_000)), "STALE 16m");
});

test("short history remains on its true two-hour timeline", () => {
  const reading = parseGlucoseSnapshot({
    version: 1, timestamp: NOW - 3 * 60_000, value: 118,
    points: [[NOW - 20 * 60_000, 110], [NOW - 3 * 60_000, 118]],
  }, NOW);
  const points = chartCoordinates(reading, NOW, GRAPH.w, GRAPH.h, CHART_MINUTES);
  assert.ok(points[0].x > GRAPH.w / 2, "Missing older values must remain blank");
});

test("shared reading fallback works when the history record is absent or malformed", () => {
  const compact = JSON.stringify({
    version: 1, timestamp: NOW - 2 * 60_000,
    value: 118, trend: 3, points: [],
  });
  assert.equal(chooseSharedSnapshot("", compact, "", NOW), compact);
  assert.equal(chooseSharedSnapshot("invalid JSON", compact, "", NOW), compact);
  assert.equal(chooseSharedSnapshot("", "", "", NOW), "");
  const old = JSON.stringify({
    version: 1, timestamp: NOW - 8 * 60_000,
    value: 110, trend: 3, points: [],
  });
  assert.equal(chooseSharedSnapshot(old, compact, "", NOW), compact);
  assert.equal(chooseSharedSnapshot("", old, compact, NOW), compact,
    "An older background reading must never roll back the current value");
});

test("shared full history wins over the minimal reading at equal timestamps", () => {
  const reading = {
    version: 1, timestamp: NOW - 2 * 60_000,
    value: 118, trend: 3, points: [],
  };
  const short = JSON.stringify(reading);
  const full = JSON.stringify({
    ...reading,
    points: [[NOW - 8 * 60_000, 113], [NOW - 2 * 60_000, 118]],
  });
  assert.equal(chooseSharedSnapshot(full, short, "", NOW), full);
  assert.equal(chooseSharedSnapshot(short, short, full, NOW), full);
});

test("fresh heartbeat requires confirmed wear, multiple callbacks, and new samples", () => {
  const data = {
    wearStatus: 1, wearingSince: NOW - MIN_WEAR_DURATION_MS - 1,
    bpm: 72, measuredAt: NOW - 2000, eventCount: 2, now: NOW,
  };
  assert.equal(isHeartRateDisplayable(data), true);
  assert.equal(isHeartRateDisplayable({ ...data, wearStatus: 0 }), false);
  assert.equal(isHeartRateDisplayable({ ...data, eventCount: 1 }), false);
  assert.equal(isHeartRateDisplayable({ ...data, measuredAt: NOW - 90_000 }), false);
});

test("the face is read-only, has no diagnostic text and declares normal/AOD widgets", () => {
  const source = readFileSync(new URL("../watchface/index.js", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../app.json", import.meta.url)));
  assert.equal(manifest.app.appType, "watchface");
  assert.equal(manifest.app.appId, 1092843);
  assert.match(source, /new TypedStorage\(PRODUCER_APP_ID, SHARED_SCOPE\)/);
  assert.match(source, /SHARED_READING_KEY/);
  assert.match(source, /"NO SHARE"/);
  assert.match(source, /"BAD SHARE"/);
  assert.match(source, /"READ ERROR"/);
  assert.match(source, /show_level\.ONAL_AOD/);
  assert.match(source, /WIDGET_DELEGATE/);
  assert.match(source, /onPerMinute/);
  assert.doesNotMatch(source, /"WRIST |"SHARE |"AOD SYSTEM|BG TICK|fetch\(/);
});
