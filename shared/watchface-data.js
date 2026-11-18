export const WATCHFACE_SHARED_SCOPE = "libre-glucose-face-v1";
export const WATCHFACE_SHARED_KEY = "snapshot";
const CHART_WINDOW_MS = 120 * 60_000;
const MAX_SHARED_POINTS = 48;

// Keep the shared record small. Store actual timestamped measurements only.
export function createWatchfacePayload(snapshot, now = Date.now()) {
  if (!snapshot || !Number.isFinite(snapshot.timestamp) ||
      !Number.isFinite(snapshot.savedAt) ||
      !Number.isFinite(snapshot.value) ||
      snapshot.value < 20 || snapshot.value > 600 ||
      snapshot.timestamp > now + 60_000) return null;

  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const points = history
    .filter((point) => Number.isFinite(point?.timestamp) &&
      Number.isFinite(point?.value) && point.value >= 20 && point.value <= 600 &&
      point.timestamp <= now + 60_000 &&
      point.timestamp >= now - CHART_WINDOW_MS)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_SHARED_POINTS)
    .map((point) => [Math.round(point.timestamp), Math.round(point.value)]);

  const t = snapshot.thresholds || {};
  return {
    version: 1,
    timestamp: Math.round(snapshot.timestamp),
    savedAt: Math.round(snapshot.savedAt),
    value: Math.round(snapshot.value),
    trend: Number.isInteger(snapshot.trend) ? snapshot.trend : 0,
    low: Number.isFinite(t.low) ? t.low : 80,
    high: Number.isFinite(t.high) ? t.high : 160,
    veryLow: Number.isFinite(t.veryLow) ? t.veryLow : 70,
    veryHigh: Number.isFinite(t.veryHigh) ? t.veryHigh : 240,
    points,
  };
}
