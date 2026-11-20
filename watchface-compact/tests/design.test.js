import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FACE_SIZE, CHART_MINUTES, PANEL, GRAPH, HEART_PILL, BATTERY_PILL,
  formatFaceDate, formatFaceTime, glucoseAgeLabel, isChartGap,
} from "../lib/design.js";
import { parseGlucoseSnapshot, chartCoordinates, readingColor } from "../lib/model.js";
import { selectReliableGlucoseRaw } from "../lib/reliable-glucose.js";
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
  assert.match(source, /show_level\.ONAL_AOD/);
  assert.match(source, /WIDGET_DELEGATE/);
  assert.match(source, /onPerMinute/);
  assert.doesNotMatch(source, /"WRIST |"SHARE |"AOD SYSTEM|BG TICK|fetch\(/);
});

test("shared storage errors are distinguishable from missing Libre glucose", async () => {
  const { describeSharedSnapshot } = await import("../lib/diagnostics.js");
  const good = JSON.stringify({
    version: 1, timestamp: NOW - 3 * 60_000,
    value: 118, trend: 3, points: [],
  });
  assert.equal(describeSharedSnapshot(good, NOW), "READ OK");
  assert.equal(describeSharedSnapshot("", NOW), "NO SHARE");
  assert.equal(describeSharedSnapshot("{", NOW), "BAD JSON");
  assert.equal(describeSharedSnapshot(JSON.stringify({
    version: 2, timestamp: NOW, value: 118,
  }), NOW), "BAD VER");
  assert.equal(describeSharedSnapshot(JSON.stringify({
    version: 1, timestamp: NOW + 2 * 60_000, value: 118,
  }), NOW), "FUTURE");
  assert.equal(describeSharedSnapshot(JSON.stringify({
    version: 1, timestamp: NOW - 7 * 60 * 60_000, value: 118,
  }), NOW), "EXPIRED");
  assert.equal(describeSharedSnapshot(JSON.stringify({
    version: 1, timestamp: NOW, value: null,
  }), NOW), "BAD VALUE");
});

test("diagnostic watchface uses the original snapshot key and shows status only on failure", () => {
  const source = readFileSync(new URL("../watchface/index.js", import.meta.url), "utf8");
  assert.match(source, /\.getString\(SHARED_KEY, ""\)/);
  assert.match(source, /describeSharedSnapshot\(full \|\| small, now\)/);
  assert.match(source, /"READ ERR"/);
  assert.match(source, /"BOOT 013"/);
  assert.match(source, /getString\\(SHARED_READING_KEY, ""\\)/);
  assert.match(source, /selectReliableGlucoseRaw/);
});


test("all compact face panels and graph fill use the same pure black background", () => {
  const source = readFileSync(new URL("../watchface/index.js", import.meta.url), "utf8");
  assert.match(source, /const PANEL_COLOR = 0x000000;/);
  assert.match(source, /const PILL_COLOR = 0x000000;/);
  assert.match(source, /const GRAPH_FILL = 0x000000;/);
});

test("compact face selects the latest valid shared or local measurement", () => {
  const raw = (age, value, points = []) => JSON.stringify({
    version: 1, timestamp: NOW - age * 60_000, value, trend: 3, points,
  });
  const previous = raw(32, 110);
  const newest = raw(2, 123);
  const selected = selectReliableGlucoseRaw(["invalid", "", previous, newest], NOW);
  const result = parseGlucoseSnapshot(selected, NOW);
  assert.equal(result.value, 123);
  assert.equal(result.ageMinutes, 2);
  assert.equal(selectReliableGlucoseRaw(["", previous], NOW) !== "", true);
  const cached = parseGlucoseSnapshot(selectReliableGlucoseRaw(["", previous], NOW), NOW);
  assert.equal(cached.ageMinutes, 32);
  assert.equal(readingColor(cached), 0x8b97a4, "Older data must be visibly stale");
});

test("compact face preserves actual chart history on lightweight reading updates", () => {
  const full = JSON.stringify({
    version: 1, timestamp: NOW - 7 * 60_000, value: 110,
    points: [[NOW - 20 * 60_000, 105], [NOW - 7 * 60_000, 110]],
  });
  const latest = JSON.stringify({
    version: 1, timestamp: NOW - 2 * 60_000, value: 119, points: [],
  });
  const parsed = parseGlucoseSnapshot(selectReliableGlucoseRaw([full, latest], NOW), NOW);
  assert.equal(parsed.value, 119);
  assert.deepEqual(parsed.points.map((p) => p.value), [105, 110, 119]);
});

test("compact face cannot present a cached reading older than six hours", () => {
  const old = JSON.stringify({
    version: 1, timestamp: NOW - 7 * 60 * 60_000, value: 110,
  });
  assert.equal(selectReliableGlucoseRaw(["", old], NOW), "");
});

test("compact face persists last real snapshot across watchface restarts", () => {
  const source = readFileSync(new URL("../watchface/index.js", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../app.json", import.meta.url)));
  assert.ok(manifest.permissions.includes("device:os.local_storage"));
  assert.match(source, /new LocalStorage\(\)/);
  assert.match(source, /getItem\(LOCAL_CACHE_KEY, ""\)/);
  assert.match(source, /setItem\(LOCAL_CACHE_KEY, raw\)/);
  assert.match(source, /getString\(SHARED_READING_KEY, ""\)/);
  assert.match(source, /getString\(SHARED_KEY, ""\)/);
});
