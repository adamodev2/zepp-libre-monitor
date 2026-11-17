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

export const DEFAULT_VERY_LOW = 70;
export const DEFAULT_LOW = 80;
export const DEFAULT_HIGH = 160;
export const DEFAULT_VERY_HIGH = 240;

export function parseGlucoseThresholds(low, high, veryLow, veryHigh) {
  const defaults = {
    veryLow: DEFAULT_VERY_LOW,
    low: DEFAULT_LOW,
    high: DEFAULT_HIGH,
    veryHigh: DEFAULT_VERY_HIGH,
  };
  const parsed = {
    veryLow: veryLow == null || veryLow === "" ? defaults.veryLow : Number(veryLow),
    low: low == null || low === "" ? defaults.low : Number(low),
    high: high == null || high === "" ? defaults.high : Number(high),
    veryHigh: veryHigh == null || veryHigh === "" ? defaults.veryHigh : Number(veryHigh),
  };
  if (!Object.values(parsed).every(Number.isInteger) ||
      parsed.veryLow < 40 || parsed.veryHigh > 400 ||
      !(parsed.veryLow < parsed.low &&
        parsed.low < parsed.high &&
        parsed.high < parsed.veryHigh)) {
    return defaults;
  }
  return parsed;
}

export function glucoseBand(value, thresholds = parseGlucoseThresholds()) {
  if (value < thresholds.veryLow) return "very-low";
  if (value < thresholds.low) return "low";
  if (value > thresholds.veryHigh) return "very-high";
  if (value > thresholds.high) return "high";
  return "target";
}
