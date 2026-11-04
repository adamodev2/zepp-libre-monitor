export const HISTORY_STORAGE_KEY = "libre_glucose_history_v1";
export const BACKGROUND_SYNC_KEY = "libre_background_sync_v1";
const MAX_AGE_MS = 6 * 60 * 60_000;
const MAX_POINTS = 361;

export function normalizeStoredPoints(points, now = Date.now()) {
  if (!Array.isArray(points)) return [];
  const byMinute = {};
  for (const point of points) {
    const timestamp = Number(point?.timestamp);
    const value = Number(point?.value);
    if (!Number.isFinite(timestamp) || !Number.isFinite(value) ||
        value < 20 || value > 600 ||
        timestamp > now + 60_000 || timestamp < now - MAX_AGE_MS) continue;
    byMinute[Math.floor(timestamp / 60_000)] = {
      timestamp,
      value: Math.round(value),
    };
  }
  return Object.keys(byMinute).map((key) => byMinute[key])
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_POINTS);
}

export function readStoredHistory(storage, patientKey, now = Date.now()) {
  if (!storage || !patientKey) return [];
  try {
    const saved = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY) || "null");
    if (saved?.version !== 1 || saved.patientKey !== patientKey) return [];
    return normalizeStoredPoints(saved.points, now);
  } catch (_) {
    return [];
  }
}

export function saveStoredHistory(storage, patientKey, points, now = Date.now()) {
  const normalized = normalizeStoredPoints(points, now);
  if (!storage || !patientKey) return normalized;
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({
      version: 1,
      patientKey,
      points: normalized,
    }));
  } catch (_) {
    // Storage failures must not prevent live glucose readings.
  }
  return normalized;
}

export function readBackgroundSyncAgeMinutes(storage, now = Date.now()) {
  if (!storage) return null;
  try {
    const timestamp = Number(storage.getItem(BACKGROUND_SYNC_KEY));
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now + 60_000) return null;
    return Math.floor(Math.max(0, now - timestamp) / 60_000);
  } catch (_) {
    return null;
  }
}

export function markBackgroundSync(storage, now = Date.now()) {
  if (!storage) return;
  try {
    storage.setItem(BACKGROUND_SYNC_KEY, String(now));
  } catch (_) {
    // Do not propagate metadata persistence failures.
  }
}
