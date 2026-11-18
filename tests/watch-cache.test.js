import test from "node:test";
import assert from "node:assert/strict";
import { WATCH_CACHE_KEY, WATCH_READING_KEY, BG_SNAPSHOT_KEY, createWatchSnapshot, readWatchSnapshot, readBackgroundSnapshot, saveWatchSnapshot } from "../shared/watch-cache.js";

function storage() {
  const memory = new Map();
  return {
    setItem(key, value) { memory.set(key, value); },
    getItem(key) { return memory.get(key); },
  };
}

test("watch restores last glucose and history without a network request", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const store = storage();
  store.setItem(WATCH_CACHE_KEY, createWatchSnapshot({
    value: 123, ageMs: 120_000, trend: 4,
    history: [
      { value: 110, ageMinutes: 62 },
      { value: 123, ageMinutes: 2 },
    ],
  }, { veryLow: 70, low: 80, high: 160, veryHigh: 240 }, now));
  const cache = readWatchSnapshot(store, now + 180_000);
  assert.equal(cache.value, 123);
  assert.equal(cache.ageMinutes, 5);
  assert.deepEqual(cache.history.map((p) => p.ageMinutes), [65, 5]);
  assert.equal(cache.thresholds.high, 160);
});

test("expired history and invalid snapshots are rejected", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const store = storage();
  assert.equal(readWatchSnapshot(store, now), null);
  store.setItem(WATCH_CACHE_KEY, createWatchSnapshot({
    value: 130, ageMs: 0, trend: 3,
    history: [{ value: 100, ageMinutes: 360 }],
  }, null, now - 7 * 60 * 60_000));
  assert.equal(readWatchSnapshot(store, now), null);
  assert.equal(createWatchSnapshot({ value: 120, ageMs: 25 * 60_000 }), null);
});

test("expired graph samples are not displayed as current history", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const store = storage();
  store.setItem(WATCH_CACHE_KEY, createWatchSnapshot({
    value: 90, ageMs: 0, trend: 2,
    history: [
      { value: 90, ageMinutes: 5 },
      { value: 85, ageMinutes: 355 },
    ],
  }, null, now));
  const cache = readWatchSnapshot(store, now + 15 * 60_000);
  assert.equal(cache.history.length, 1);
  assert.equal(cache.history[0].ageMinutes, 20);
});

test("watch restores a JSON-serialized snapshot after a new LocalStorage instance", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const state = new Map();
  const first = {
    setItem(key, value) { state.set(key, value); },
    getItem(key) { return state.get(key); },
  };
  const second = {
    getItem(key) { return state.get(key); },
  };
  const snapshot = createWatchSnapshot({
    value: 140, ageMs: 60_000, trend: 3,
    history: [{ value: 140, ageMinutes: 1 }],
  }, { veryLow: 70, low: 80, high: 160, veryHigh: 240 }, now);
  first.setItem(WATCH_CACHE_KEY, JSON.stringify(snapshot));
  const restored = readWatchSnapshot(second, now + 120_000);
  assert.equal(restored.value, 140);
  assert.equal(restored.ageMinutes, 3);
  assert.equal(restored.history[0].ageMinutes, 3);
});

test("restores the last reading if writing full history fails", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const state = new Map();
  const store = {
    setItem(key, value) {
      if (key === WATCH_CACHE_KEY) throw new Error("Graph snapshot write failed");
      state.set(key, value);
    },
    getItem(key) { return state.get(key); },
  };
  const snapshot = createWatchSnapshot({
    value: 142, trend: 3, ageMs: 60_000,
    history: [{ value: 130, ageMinutes: 5 }],
  }, null, now);
  assert.equal(saveWatchSnapshot(store, snapshot), true);
  assert.ok(state.has(WATCH_READING_KEY));
  const restored = readWatchSnapshot(store, now + 60_000);
  assert.equal(restored.value, 142);
  assert.equal(restored.ageMinutes, 2);
  assert.deepEqual(restored.history, []);
});

test("prefers newer lightweight glucose without losing stored graph points", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const store = storage();
  const first = createWatchSnapshot({
    value: 120, ageMs: 0, history: [{ value: 120, ageMinutes: 0 }],
  }, null, now);
  assert.equal(saveWatchSnapshot(store, first), true);
  const second = createWatchSnapshot({ value: 125, ageMs: 0 }, null, now + 60_000);
  store.setItem(WATCH_READING_KEY, JSON.stringify({ ...second, history: [] }));
  const restored = readWatchSnapshot(store, now + 120_000);
  assert.equal(restored.value, 125);
  assert.equal(restored.ageMinutes, 1);
  assert.equal(restored.history[0].ageMinutes, 2);
});

test("uses compact snapshot when reading full history throws", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const snapshot = createWatchSnapshot({ value: 138, ageMs: 0 }, null, now);
  const store = {
    getItem(key) {
      if (key === WATCH_CACHE_KEY) throw new Error("Snapshot unreadable");
      return JSON.stringify({ ...snapshot, history: [] });
    },
  };
  const restored = readWatchSnapshot(store, now + 60_000);
  assert.equal(restored.value, 138);
  assert.equal(restored.ageMinutes, 1);
});

test("background snapshot restores fresh glucose independently of foreground cache", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const store = storage();
  const snapshot = createWatchSnapshot({
    value: 145, ageMs: 60_000, trend: 3,
    history: [{ value: 145, ageMinutes: 1 }],
  }, null, now);
  store.setItem(BG_SNAPSHOT_KEY, JSON.stringify(snapshot));
  const restored = readBackgroundSnapshot(store, now + 2 * 60_000);
  assert.equal(restored.value, 145);
  assert.equal(restored.ageMinutes, 3);
  assert.equal(restored.history[0].ageMinutes, 3);
});

test("background cache rejects malformed and expired readings", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  const store = storage();
  store.setItem(BG_SNAPSHOT_KEY, '{"version":1,"value":999}');
  assert.equal(readBackgroundSnapshot(store, now), null);
  const old = createWatchSnapshot({ value: 120, ageMs: 0 }, null, now - 7 * 60 * 60_000);
  store.setItem(BG_SNAPSHOT_KEY, JSON.stringify(old));
  assert.equal(readBackgroundSnapshot(store, now), null);
});
