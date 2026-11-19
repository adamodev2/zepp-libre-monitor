import { ShareTypedStorage } from "@zos/storage";
import {
  WATCHFACE_SHARED_SCOPE,
  WATCHFACE_SHARED_KEY,
  WATCHFACE_READING_KEY,
  WATCHFACE_RANGE_KEY,
  createWatchfacePayload,
} from "./watchface-data";

// The Mini App and AppService are the only publishers.
// This module never runs in the watchface package.
export function publishWatchfaceSnapshot(snapshot) {
  const payload = createWatchfacePayload(snapshot);
  if (!payload) return false;

  try {
    const shared = new ShareTypedStorage(WATCHFACE_SHARED_SCOPE);
    // Check both previous keys before writing to avoid an older background
    // response rolling the active watchface back to a previous measurement.
    for (const key of [WATCHFACE_READING_KEY, WATCHFACE_SHARED_KEY]) {
      let previousRaw = "";
      try { previousRaw = shared.getString(key, ""); } catch (_) {}
      if (!previousRaw) continue;
      try {
        const previous = JSON.parse(previousRaw);
        if (Number.isFinite(previous?.timestamp) &&
            (previous.timestamp > payload.timestamp ||
             (previous.timestamp === payload.timestamp &&
              Number(previous.savedAt) > payload.savedAt))) {
          console.log("[LibreMonitor] WATCHFACE_OLDER_READING_SKIPPED");
          return false;
        }
      } catch (_) {
        // Invalid previous data must not prevent replacing it.
      }
    }

    // Write the short reading first. The 2h/6h history is optional and may
    // exceed storage limits on some watch firmware versions.
    const minimal = JSON.stringify({ ...payload, points: [] });
    let readingOK = false;
    try {
      shared.putString(WATCHFACE_READING_KEY, minimal);
      readingOK = shared.getString(WATCHFACE_READING_KEY, "") === minimal;
    } catch (_) {
      console.log("[LibreMonitor] WATCHFACE_READING_WRITE_FAILED");
    }
    if (!readingOK) console.log("[LibreMonitor] WATCHFACE_READING_VERIFY_FAILED");

    const serialized = JSON.stringify(payload);
    let historyOK = false;
    try {
      shared.putString(WATCHFACE_SHARED_KEY, serialized);
      historyOK = shared.getString(WATCHFACE_SHARED_KEY, "") === serialized;
    } catch (_) {
      console.log("[LibreMonitor] WATCHFACE_HISTORY_WRITE_FAILED");
    }
    if (!historyOK) console.log("[LibreMonitor] WATCHFACE_SHARE_VERIFY_FAILED");
    if (!readingOK && !historyOK) return false;
    console.log(historyOK ? "[LibreMonitor] WATCHFACE_SNAPSHOT_PUBLISHED" :
      "[LibreMonitor] WATCHFACE_READING_ONLY_PUBLISHED");
    return true;
  } catch (_) {
    console.log("[LibreMonitor] WATCHFACE_SHARE_UNAVAILABLE");
    return false;
  }
}

export function publishWatchfaceChartRange(minutes) {
  if (minutes !== 120 && minutes !== 360) return false;
  try {
    new ShareTypedStorage(WATCHFACE_SHARED_SCOPE).putInt(WATCHFACE_RANGE_KEY, minutes);
    return true;
  } catch (_) {
    console.log("[LibreMonitor] WATCHFACE_RANGE_SHARE_UNAVAILABLE");
    return false;
  }
}
