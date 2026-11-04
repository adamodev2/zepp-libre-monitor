import test from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_STORAGE_KEY, BACKGROUND_SYNC_KEY,
  normalizeStoredPoints, readStoredHistory, saveStoredHistory,
  markBackgroundSync, readBackgroundSyncAgeMinutes,
} from "../app-side/history-store.js";

const now = Date.parse("2026-11-04T15:00:00Z");

function createStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, value); },
  };
}

test("history survives a simulated Side Service restart", () => {
  const storage = createStorage();
  const observations = [
    { timestamp: now - 90 * 60_000, value: 104 },
    { timestamp: now - 2 * 60_000, value: 120 },
  ];
  saveStoredHistory(storage, "patient-hash-a", observations, now);
  assert.deepEqual(readStoredHistory(storage, "patient-hash-a", now), observations);
  assert.equal(readStoredHistory(storage, "patient-hash-b", now).length, 0);
});

test("stored glucose stays bounded to six hours and deduplicated by minute", () => {
  const storage = createStorage();
  const points = [
    { timestamp: now - 7 * 60 * 60_000, value: 77 },
    { timestamp: now - 60_000 + 2_000, value: 135 },
    { timestamp: now - 60_000 + 30_000, value: 136 },
    { timestamp: now + 90_000, value: 155 },
    { timestamp: now - 5 * 60_000, value: 130 },
  ];
  const stored = saveStoredHistory(storage, "patient", points, now);
  assert.deepEqual(stored.map((item) => item.value), [130, 136]);
  assert.equal(stored.length, 2);
  assert.ok(JSON.parse(storage.getItem(HISTORY_STORAGE_KEY)).points.length === 2);
});

test("corrupt or mismatched persisted history is ignored", () => {
  const storage = createStorage();
  storage.setItem(HISTORY_STORAGE_KEY, "{bad");
  assert.deepEqual(readStoredHistory(storage, "patient", now), []);
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, patientKey: "another", points: [] }));
  assert.deepEqual(readStoredHistory(storage, "patient", now), []);
});

test("storage contains no credentials or tokens", () => {
  const storage = createStorage();
  saveStoredHistory(storage, "opaque-fingerprint", [{ timestamp: now, value: 115 }], now);
  const serialized = storage.getItem(HISTORY_STORAGE_KEY);
  assert.ok(!serialized.includes("password"));
  assert.ok(!serialized.includes("Bearer"));
});

test("background synchronization age uses the phone clock", () => {
  const storage = createStorage();
  assert.equal(readBackgroundSyncAgeMinutes(storage, now), null);
  markBackgroundSync(storage, now - 3 * 60_000);
  assert.equal(storage.getItem(BACKGROUND_SYNC_KEY), String(now - 3 * 60_000));
  assert.equal(readBackgroundSyncAgeMinutes(storage, now), 3);
  assert.equal(readBackgroundSyncAgeMinutes(storage, now - 10 * 60_000), null);
});

test("invalid stored measurements are discarded", () => {
  const points = normalizeStoredPoints([
    { timestamp: now - 2_000, value: 102 },
    { timestamp: now - 1_000, value: 0 },
    { timestamp: "unknown", value: 120 },
    { timestamp: now - 800, value: 999 },
  ], now);
  assert.deepEqual(points.map((point) => point.value), [102]);
});
