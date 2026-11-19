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
  try {
    const payload = createWatchfacePayload(snapshot);
    if (!payload) return false;
    const shared = new ShareTypedStorage(WATCHFACE_SHARED_SCOPE);
    const keys = [WATCHFACE_READING_KEY, WATCHFACE_SHARED_KEY];

    // Avoid rolling a newer background/foreground glucose measurement back.
    for (const key of keys) {
      let oldRaw = "";
      try { oldRaw = shared.getString(key, ""); } catch (_) {}
      if (!oldRaw) continue;
      try {
        const previous = JSON.parse(oldRaw);
        if (Number.isFinite(previous?.timestamp) &&
            (previous.timestamp > payload.timestamp ||
             (previous.timestamp === payload.timestamp &&
              Number(previous.savedAt) > payload.savedAt))) {
          console.log("[LibreMonitor] WATCHFACE_OLDER_READING_SKIPPED");
          return false;
        }
      } catch (_) {
        // Invalid existing data is safe to replace.
      }
    }

    // The lightweight current reading is essential; the large chart is
    // best effort and must not be able to blank the glucose value.
    let readingOK = false;
    try {
      const serialized = JSON.stringify({ ...payload, points: [] });
      shared.putString(WATCHFACE_READING_KEY, serialized);
      readingOK = shared.getString(WATCHFACE_READING_KEY, "") === serialized;
    } catch (_) {
      console.log("[LibreMonitor] WATCHFACE_READING_WRITE_FAILED");
    }

    let historyOK = false;
    try {
      const serialized = JSON.stringify(payload);
      shared.putString(WATCHFACE_SHARED_KEY, serialized);
      historyOK = shared.getString(WATCHFACE_SHARED_KEY, "") === serialized;
    } catch (_) {
      console.log("[LibreMonitor] WATCHFACE_HISTORY_WRITE_FAILED");
    }

    if (!readingOK) console.log("[LibreMonitor] WATCHFACE_READING_VERIFY_FAILED");
    if (!historyOK) console.log("[LibreMonitor] WATCHFACE_HISTORY_VERIFY_FAILED");
    if (historyOK) console.log("[LibreMonitor] WATCHFACE_SNAPSHOT_PUBLISHED");
    else if (readingOK) console.log("[LibreMonitor] WATCHFACE_READING_ONLY_PUBLISHED");
    return readingOK || historyOK;
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
