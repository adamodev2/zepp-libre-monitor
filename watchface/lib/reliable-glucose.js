import { parseGlucoseSnapshot } from "./model.js";

// Choose the newest actual Libre reading from shared full history, lightweight
// shared reading, in-memory state and the last persisted face record.
// Keep only real graph timestamps, never interpolate a missing measurement.
export function selectReliableGlucoseRaw(records, now = Date.now()) {
  const valid = [];
  for (const raw of records) {
    if (typeof raw !== "string" || !raw) continue;
    const reading = parseGlucoseSnapshot(raw, now);
    if (reading) valid.push({ raw, reading });
  }
  if (!valid.length) return "";
  valid.sort((a, b) => b.reading.timestamp - a.reading.timestamp ||
    b.reading.points.length - a.reading.points.length);
  const latest = valid[0];
  const actualPoints = new Map();
  for (const { reading } of valid) {
    for (const point of reading.points) {
      if (point.timestamp <= latest.reading.timestamp) {
        actualPoints.set(point.timestamp, [point.timestamp, point.value]);
      }
    }
  }
  // The newest CGM measurement itself is also a real chart sample.
  actualPoints.set(latest.reading.timestamp,
    [latest.reading.timestamp, latest.reading.value]);
  const points = Array.from(actualPoints.values())
    .sort((a, b) => a[0] - b[0]).slice(-76);
  try {
    return JSON.stringify({ ...JSON.parse(latest.raw), points });
  } catch (_) {
    return "";
  }
}
