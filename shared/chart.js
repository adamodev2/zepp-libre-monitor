const SAMPLE_MINUTES = 5;
const MAX_CONNECT_GAP_MINUTES = 20;

export function chartSegments(points, minutes, width, height) {
  if (!Array.isArray(points) || (minutes !== 120 && minutes !== 360)) {
    return { lines: [], segments: [], dots: [], count: 0, min: 70, max: 180 };
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
  let chain = [];

  for (let i = 0; i < valid.length; i++) {
    const current = dots[i];
    if (i > 0 && valid[i - 1].ageMinutes - valid[i].ageMinutes > MAX_CONNECT_GAP_MINUTES) {
      if (chain.length > 1) segments.push(chain);
      chain = [];
    }
    chain.push(current);
    if (i > 0 && valid[i - 1].ageMinutes - valid[i].ageMinutes <= MAX_CONNECT_GAP_MINUTES) {
      const previous = dots[i - 1];
      if (previous.x !== current.x || previous.y !== current.y) {
        lines.push({ x1: previous.x, y1: previous.y, x2: current.x, y2: current.y });
      }
    }
  }
  if (chain.length > 1) segments.push(chain);
  return { lines, segments, dots, count: valid.length, min, max };
}
