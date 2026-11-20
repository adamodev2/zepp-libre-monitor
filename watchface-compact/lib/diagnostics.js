import { parseGlucoseSnapshot } from "./model.js";

// Compact developer build: classify the shared value without showing account
// details, tokens or raw glucose history on the watch face.
export function describeSharedSnapshot(raw, now) {
  if (!raw) return "NO SHARE";
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_) {
    return "BAD JSON";
  }
  if (!value || value.version !== 1) return "BAD VER";
  if (!Number.isFinite(value.timestamp)) return "BAD TIME";
  if (value.timestamp > now + 60_000) return "FUTURE";
  if (value.timestamp < now - 6 * 60 * 60_000) return "EXPIRED";
  if (!Number.isFinite(value.value) || value.value < 20 || value.value > 600)
    return "BAD VALUE";
  if (!parseGlucoseSnapshot(value, now)) return "INVALID";
  return "READ OK";
}
