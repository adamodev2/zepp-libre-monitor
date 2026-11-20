export const WATCHFACE_SHARED_SCOPE = "libre-glucose-face-v1";
export const WATCHFACE_SHARED_KEY = "snapshot";
export const WATCHFACE_READING_KEY = "reading";
export const WATCHFACE_RANGE_KEY = "chart_range_minutes";
const CHART_WINDOW_MS = 360 * 60_000;
const MAX_SHARED_POINTS = 76;

// A smaller independent key protects the current measurement when a larger
// history write or cross-app read fails. The original timestamp is unchanged.
export function createWatchfaceReadingPayload(snapshot, now = Date.now()) {
  const full = createWatchfacePayload(snapshot, now);
  return full ? { ...full, points: [] } : null;
}

// Keep the shared record small. Store actual timestamped measurements only.
export function createWatchfacePayload(snapshot, now = Date.now()) {
  if (!snapshot || !Number.isFinite(snapshot.timestamp) ||
      !Number.isFinite(snapshot.savedAt) ||
      !Number.isFinite(snapshot.value) ||
      snapshot.value < 20 || snapshot.value > 600 ||
      snapshot.timestamp > now + 60_000) return null;

  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const filtered = history
    .filter((point) => Number.isFinite(point?.timestamp) &&
      Number.isFinite(point?.value) && point.value >= 20 && point.value <= 600 &&
      point.timestamp <= now + 60_000 &&
      point.timestamp >= now - CHART_WINDOW_MS)
    .sort((a, b) => a.timestamp - b.timestamp);
  // Keep the newest actual reading per five-minute bucket for a six-hour view.
  // No synthetic samples or interpolation are introduced.
  const buckets = [];
  for (const point of filtered) {
    const bucket = Math.floor(point.timestamp / (5 * 60_000));
    const pair = [Math.round(point.timestamp), Math.round(point.value)];
    const last = buckets[buckets.length - 1];
    if (last && last.bucket === bucket) last.pair = pair;
    else buckets.push({ bucket, pair });
  }
  const points = buckets.slice(-MAX_SHARED_POINTS).map((entry) => entry.pair);

  const t = snapshot.thresholds || {};
  return {
    version: 1,
    timestamp: Math.round(snapshot.timestamp),
    savedAt: Math.round(snapshot.savedAt),
    publishedAt: Math.round(now),
    value: Math.round(snapshot.value),
    trend: Number.isInteger(snapshot.trend) ? snapshot.trend : 0,
    low: Number.isFinite(t.low) ? t.low : 80,
    high: Number.isFinite(t.high) ? t.high : 160,
    veryLow: Number.isFinite(t.veryLow) ? t.veryLow : 70,
    veryHigh: Number.isFinite(t.veryHigh) ? t.veryHigh : 240,
    points,
  };
}
