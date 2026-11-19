// Fixed 466px round layout, inspired by the large-time compact glucose mockup.
// All displayed measurements and graph points come from the shared Mini App.
export const FACE_SIZE = 466;
export const CHART_MINUTES = 120;
export const PANEL = Object.freeze({ x: 26, y: 208, w: 414, h: 143 });
export const GRAPH = Object.freeze({ x: 272, y: 252, w: 143, h: 50 });
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

export function glucoseAgeLabel(reading) {
  if (!reading) return "NO DATA";
  if (reading.ageMinutes > 15) return "STALE " + reading.ageMinutes + "m";
  return reading.ageMinutes + " min";
}

export function isChartGap(a, b) {
  return !a || !b || b.timestamp <= a.timestamp ||
    b.timestamp - a.timestamp > 11 * 60_000;
}
