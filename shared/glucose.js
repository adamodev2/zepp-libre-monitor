export function normalizeReading(raw) {
  if (!raw || !Number.isFinite(Number(raw.value))) {
    throw new Error("Missing glucose value");
  }
  const value = Math.round(Number(raw.value));
  const trend = Number(raw.trend);
  const timestamp = Number(raw.timestamp);
  return {
    value,
    trend: Number.isFinite(trend) ? trend : 0,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    source: String(raw.source || "unknown"),
  };
}

export function trendArrow(trend) {
  return ({ 1: "↓", 2: "↘", 3: "→", 4: "↗", 5: "↑" })[trend] || "·";
}

export function glucoseBand(value) {
  if (value < 70) return "low";
  if (value > 180) return "high";
  return "target";
}
