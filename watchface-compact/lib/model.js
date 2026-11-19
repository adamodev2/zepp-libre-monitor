export const DEFAULT_CHART_MINUTES = 360;

// Prefer the newest valid Libre measurement, never a newly-written but older
// shared-storage record. On equal timestamps, retain the richer history.
export function chooseSharedSnapshot(snapshotRaw, readingRaw, previousRaw, now = Date.now()) {
  const candidates = [snapshotRaw, readingRaw, previousRaw]
    .filter((raw) => typeof raw === "string" && raw.length > 0)
    .map((raw) => ({ raw, reading: parseGlucoseSnapshot(raw, now) }))
    .filter(({ reading }) => reading !== null);
  if (!candidates.length) return "";
  candidates.sort((a, b) => b.reading.timestamp - a.reading.timestamp ||
    b.reading.points.length - a.reading.points.length);
  return candidates[0].raw;
}

export const STALE_AFTER_MINUTES = 15;
const MAX_AGE_MS = 6 * 60 * 60_000;

export function parseGlucoseSnapshot(raw, now = Date.now()) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || data.version !== 1 ||
        !Number.isFinite(data.value) || data.value < 20 || data.value > 600 ||
        !Number.isFinite(data.timestamp) ||
        data.timestamp > now + 60_000 ||
        data.timestamp < now - MAX_AGE_MS) return null;
    const points = Array.isArray(data.points) ? data.points : [];
    return {
      value: Math.round(data.value),
      trend: Number.isInteger(data.trend) && data.trend >= 1 && data.trend <= 5 ? data.trend : 0,
      timestamp: data.timestamp,
      publishedAt: Number.isFinite(data.publishedAt) &&
        data.publishedAt <= now + 60_000 ? data.publishedAt : null,
      publishAgeMinutes: Number.isFinite(data.publishedAt) &&
        data.publishedAt <= now + 60_000 ?
          Math.max(0, Math.floor((now - data.publishedAt) / 60_000)) : null,
      ageMinutes: Math.max(0, Math.floor((now - data.timestamp) / 60_000)),
      low: Number.isFinite(data.low) ? data.low : 80,
      high: Number.isFinite(data.high) ? data.high : 160,
      veryLow: Number.isFinite(data.veryLow) ? data.veryLow : 70,
      veryHigh: Number.isFinite(data.veryHigh) ? data.veryHigh : 240,
      points: points.filter((p) => Array.isArray(p) && p.length === 2 &&
        Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
        p[0] >= now - MAX_AGE_MS && p[0] <= now + 60_000 &&
        p[1] >= 20 && p[1] <= 600)
        .map((p) => ({ timestamp: p[0], value: Math.round(p[1]) }))
        .sort((a, b) => a.timestamp - b.timestamp),
    };
  } catch (_) {
    return null;
  }
}

export function readingColor(reading) {
  if (!reading || reading.ageMinutes > STALE_AFTER_MINUTES) return 0x8b97a4;
  if (reading.value < reading.veryLow || reading.value > reading.veryHigh) return 0xff5d68;
  if (reading.value < reading.low || reading.value > reading.high) return 0xffc247;
  return 0x41d98a;
}

export function chartCoordinates(reading, now, width, height, minutes = DEFAULT_CHART_MINUTES) {
  if (!reading) return [];
  const windowMinutes = minutes === 120 ? 120 : 360;
  const start = now - windowMinutes * 60_000;
  const history = reading.points.filter((p) =>
    p.timestamp >= start && p.timestamp <= now + 60_000);
  if (history.length === 0) return [];
  const min = Math.max(40, Math.min(...history.map((p) => p.value)) - 15);
  const max = Math.min(500, Math.max(...history.map((p) => p.value)) + 15);
  const span = Math.max(30, max - min);
  return history.map((p) => ({
    x: Math.max(0, Math.min(width - 1, Math.round(((p.timestamp - start) / (windowMinutes * 60_000)) * (width - 1)))),
    y: Math.max(0, Math.min(height - 1, Math.round(((max - p.value) / span) * (height - 1)))),
    timestamp: p.timestamp,
    value: p.value,
  }));
}

export function linePixels(points, maxPixels = 140) {
  const output = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    // Never draw a misleading line over missing CGM measurements.
    if (b.timestamp - a.timestamp > 11 * 60_000 || b.timestamp <= a.timestamp) continue;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let k = 0; k <= steps; k += 4) {
      output.push({ x: Math.round(a.x + (b.x - a.x) * k / Math.max(1, steps)),
        y: Math.round(a.y + (b.y - a.y) * k / Math.max(1, steps)) });
    }
  }
  if (output.length <= maxPixels) return output;
  const stride = Math.ceil(output.length / maxPixels);
  return output.filter((_, i) => i % stride === 0);
}
