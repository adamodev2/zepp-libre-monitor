// Fixed 466px round layout, inspired by the large-time compact glucose mockup.
// All displayed measurements and graph points come from the shared Mini App.
export const FACE_SIZE = 466;
export const CHART_MINUTES = 120;
export const PANEL = Object.freeze({ x: 26, y: 208, w: 414, h: 143 });
export const GLUCOSE_TEXT = Object.freeze({ x: 48, y: 225, w: 164, h: 96, size: 89 });
export const TREND_ARROW = Object.freeze({
  centerX: 230, centerY: GLUCOSE_TEXT.y + GLUCOSE_TEXT.h / 2,
  halfLength: 17, headLength: 12, headWidth: 9, strokeSize: 5,
});
// The two-hour time axis starts immediately after the arrow, not at x=272.
export const GRAPH = Object.freeze({ x: 261, y: 241, w: 163, h: 63 });
export const HEART_PILL = Object.freeze({ x: 104, y: 373, w: 108, h: 46 });
export const BATTERY_PILL = Object.freeze({ x: 226, y: 373, w: 146, h: 46 });

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function formatFaceTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return pad(date.getHours()) + ":" + pad(date.getMinutes());
}

export function formatFaceDate(timestamp) {
  const date = new Date(timestamp);
  return DAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()];
}

// Match the Mini App LIVE label: age of the Libre sensor measurement,
// never the age of the last face repaint or shared-storage write.
export function glucoseAgeLabel(reading) {
  if (!reading) return "NO DATA";
  if (reading.ageMinutes > 15) return "STALE " + reading.ageMinutes + "m";
  return reading.ageMinutes + " min";
}

export function isChartGap(a, b) {
  return !a || !b || b.timestamp <= a.timestamp ||
    b.timestamp - a.timestamp > 11 * 60_000;
}
