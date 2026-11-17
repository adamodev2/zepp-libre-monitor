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

export const DEFAULT_LOW = 80;
export const DEFAULT_HIGH = 160;

export function parseGlucoseThresholds(low, high) {
  const lower = Number(low);
  const upper = Number(high);
  if (!Number.isInteger(lower) || !Number.isInteger(upper) ||
      lower < 40 || upper > 400 || lower >= upper) {
    return { low: DEFAULT_LOW, high: DEFAULT_HIGH };
  }
  return { low: lower, high: upper };
}

export function glucoseBand(value, thresholds = { low: DEFAULT_LOW, high: DEFAULT_HIGH }) {
  if (value < thresholds.low) return "low";
  if (value > thresholds.high) return "high";
  return "target";
}
