export const WATCH_CACHE_KEY = "libre_watch_snapshot_v1";
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

export function readWatchSnapshot(storage, now = Date.now()) {
  try {
    const stored = storage?.getItem(WATCH_CACHE_KEY);
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
