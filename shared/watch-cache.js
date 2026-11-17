export const WATCH_CACHE_KEY = "libre_watch_snapshot_v1";
export const WATCH_READING_KEY = "libre_watch_reading_v1";
export const BG_DIAGNOSTIC_STORAGE_PATH = "libre-bg-diagnostics";
export const BG_SERVICE_DEBUG_KEY = "libre_bg_service_debug_v1";
const MAX_HISTORY_MS = 6 * 60 * 60_000;
const MAX_POINTS = 361;

export function createWatchSnapshot(reading, thresholds, now = Date.now()) {
  const ageMs = Number(reading?.ageMs);
  const value = Number(reading?.value);
  if (!Number.isFinite(ageMs) || ageMs < -60_000 || ageMs > 15 * 60_000 ||
      !Number.isFinite(value) || value < 20 || value > 600) return null;
  const timestamp = now - ageMs;
  const history = Array.isArray(reading.history) ? reading.history : [];
  const points = [];
  for (const sample of history) {
    const minutes = Number(sample?.ageMinutes);
    const glucose = Number(sample?.value);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 360 ||
        !Number.isFinite(glucose) || glucose < 20 || glucose > 600) continue;
    points.push({ timestamp: now - minutes * 60_000, value: Math.round(glucose) });
  }
  return {
    version: 1,
    timestamp,
    value: Math.round(value),
    trend: Number(reading.trend) || 0,
    thresholds,
    history: points.slice(-MAX_POINTS),
    savedAt: now,
  };
}

function parseStoredSnapshot(stored, now) {
  try {
    const snapshot = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!snapshot || snapshot.version !== 1 ||
        !Number.isFinite(snapshot.timestamp) ||
        !Number.isFinite(snapshot.value) ||
        snapshot.value < 20 || snapshot.value > 600 ||
        snapshot.timestamp > now + 60_000 ||
        snapshot.savedAt > now + 60_000 ||
        !Number.isFinite(snapshot.savedAt) ||
        snapshot.savedAt < now - MAX_HISTORY_MS) return null;
    const history = Array.isArray(snapshot.history) ? snapshot.history : [];
    const points = history.filter((point) =>
      Number.isFinite(point?.timestamp) && Number.isFinite(point?.value) &&
      point.timestamp <= now + 60_000 && point.timestamp >= now - MAX_HISTORY_MS &&
      point.value >= 20 && point.value <= 600
    ).map((point) => ({
      value: Math.round(point.value),
      ageMinutes: Math.max(0, (now - point.timestamp) / 60_000),
    }));
    return { ...snapshot, history: points, ageMinutes: Math.max(0, Math.floor((now - snapshot.timestamp) / 60_000)) };
  } catch (_) {
    return null;
  }
}

// A small independent record ensures a graph write failure cannot blank the
// previous measurement. The full snapshot key remains backward compatible.
export function saveWatchSnapshot(storage, snapshot) {
  if (!storage || !snapshot) return false;
  try {
    const { history, ...reading } = snapshot;
    storage.setItem(WATCH_READING_KEY, JSON.stringify({ ...reading, history: [] }));
  } catch (_) {
    // Continue: the full snapshot may still succeed.
  }
  try {
    storage.setItem(WATCH_CACHE_KEY, JSON.stringify(snapshot));
  } catch (_) {
    // Keep the independently saved reading when chart storage fails.
  }
  const checked = readWatchSnapshot(storage, snapshot.savedAt);
  return Boolean(checked && checked.value === snapshot.value && checked.timestamp === snapshot.timestamp);
}

function readStoredKey(storage, key, now) {
  try {
    return parseStoredSnapshot(storage?.getItem(key), now);
  } catch (_) {
    return null;
  }
}

export function readWatchSnapshot(storage, now = Date.now()) {
  const full = readStoredKey(storage, WATCH_CACHE_KEY, now);
  const small = readStoredKey(storage, WATCH_READING_KEY, now);
  if (!small) return full;
  if (!full) return small;
  if (full.savedAt > small.savedAt) return full;
  // Use the newest reading and the real, timestamped history saved so far.
  return { ...small, history: full.history };
}
