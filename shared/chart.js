const SAMPLE_MINUTES = 5;
const MAX_CONNECT_GAP_MINUTES = 20;
const MAX_DASHED_GAP_MINUTES = 30;

export function chartSegments(points, minutes, width, height) {
  if (!Array.isArray(points) || (minutes !== 120 && minutes !== 360)) {
    return { lines: [], segments: [], dots: [], count: 0, min: 70, max: 180, maxGapMinutes: 0 };
  }

  // Retain the newest real measurement in each five-minute age bucket.
  // Do not interpolate glucose values or manufacture missing samples.
  const buckets = {};
  for (const point of points) {
    if (!Number.isFinite(point?.value) || !Number.isFinite(point?.ageMinutes) ||
        point.ageMinutes < 0 || point.ageMinutes > minutes ||
        point.value < 20 || point.value > 600) continue;
    const bucket = Math.floor(point.ageMinutes / SAMPLE_MINUTES);
    if (!buckets[bucket] || point.ageMinutes < buckets[bucket].ageMinutes) {
      buckets[bucket] = point;
    }
  }
  const valid = Object.keys(buckets).map((key) => buckets[key])
    .sort((a, b) => b.ageMinutes - a.ageMinutes);

  const values = valid.map((point) => point.value);
  const min = Math.min(70, ...values);
  const max = Math.max(180, ...values);
  const range = Math.max(1, max - min);
  const pos = (point) => ({
    x: Math.round(((minutes - point.ageMinutes) / minutes) * (width - 1)),
    y: Math.round((1 - (point.value - min) / range) * (height - 1)),
  });

  const dots = valid.map(pos);
  const lines = [];
  const segments = [];
  let maxGapMinutes = 0;
  let chain = [];

  for (let i = 0; i < valid.length; i++) {
    const current = dots[i];
    const previous = i > 0 ? valid[i - 1] : null;
    const gapMinutes = previous ? previous.ageMinutes - valid[i].ageMinutes : 0;
    if (previous && gapMinutes > MAX_CONNECT_GAP_MINUTES) {
      maxGapMinutes = Math.max(maxGapMinutes, gapMinutes);
    }

    // A delayed graph sample can leave a gap behind as newer live samples
    // arrive. Apply the same gap rendering everywhere, not only at the tail.
    const dashed = Boolean(previous &&
      gapMinutes > MAX_CONNECT_GAP_MINUTES &&
      gapMinutes <= MAX_DASHED_GAP_MINUTES);
    const connected = Boolean(previous &&
      (gapMinutes <= MAX_CONNECT_GAP_MINUTES || dashed));

    if (previous && !connected) {
      if (chain.length > 1) segments.push(chain);
      chain = [];
    }
    chain.push(current);
    if (connected) {
      const previousDot = dots[i - 1];
      if (previousDot.x !== current.x || previousDot.y !== current.y) {
        lines.push({
          x1: previousDot.x, y1: previousDot.y,
          x2: current.x, y2: current.y,
          dashed,
        });
      }
    }
  }

  if (chain.length > 1) segments.push(chain);
  return { lines, segments, dots, count: valid.length, min, max, maxGapMinutes };
}

// Rasterize connected graph segments in the same top-left coordinate system
// used by Zepp CIRCLE widgets. This avoids device-specific polyline offsets.
// The budget limits the number of widgets used for the trace.
export function chartStrokePixels(lines, budget = 160) {
  if (!Array.isArray(lines) || !lines.length || budget < 2) return [];
  let total = 0;
  for (const line of lines) {
    total += Math.max(Math.abs(line.x2 - line.x1), Math.abs(line.y2 - line.y1));
  }
  const pixelStep = Math.max(2, Math.ceil(total / budget));
  const pixels = [];
  const seen = {};
  for (const line of lines) {
    const length = Math.max(Math.abs(line.x2 - line.x1), Math.abs(line.y2 - line.y1));
    const steps = Math.max(1, Math.ceil(length / pixelStep));
    // Endpoints are covered by the larger measurement markers.
    for (let i = 1; i < steps; i++) {
      const x = Math.round(line.x1 + ((line.x2 - line.x1) * i) / steps);
      const y = Math.round(line.y1 + ((line.y2 - line.y1) * i) / steps);
      const key = x + ":" + y;
      if (!seen[key]) {
        pixels.push({ x, y });
        seen[key] = true;
      }
    }
  }
  return pixels;
}
