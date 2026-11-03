export function chartSegments(points, minutes, width, height) {
  if (!Array.isArray(points) || (minutes !== 60 && minutes !== 120)) return { lines: [], count: 0, min: 70, max: 180 };
  const valid = points.filter((point) =>
    Number.isFinite(point?.value) && Number.isFinite(point?.ageMinutes) &&
    point.ageMinutes >= 0 && point.ageMinutes <= minutes &&
    point.value >= 20 && point.value <= 600
  ).sort((a, b) => b.ageMinutes - a.ageMinutes);
  const values = valid.map((point) => point.value);
  const min = Math.min(70, ...values);
  const max = Math.max(180, ...values);
  const range = Math.max(1, max - min);
  const pos = (point) => ({
    x: Math.round(((minutes - point.ageMinutes) / minutes) * (width - 1)),
    y: Math.round((1 - (point.value - min) / range) * (height - 1)),
  });
  const lines = [];
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1];
    const current = valid[i];
    // Do not fabricate continuity across missing samples.
    if (previous.ageMinutes - current.ageMinutes > 5) continue;
    const start = pos(previous), end = pos(current);
    if (start.x !== end.x || start.y !== end.y) lines.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  }
  return { lines, dots: valid.map(pos), count: valid.length, min, max };
}
