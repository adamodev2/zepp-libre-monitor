import { ShareTypedStorage } from "@zos/storage";
import {
  WATCHFACE_SHARED_SCOPE,
  WATCHFACE_SHARED_KEY,
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
    const previousRaw = shared.getString(WATCHFACE_SHARED_KEY, "");
    if (previousRaw) {
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
        // The previous record was invalid: replace it with validated data.
      }
    }

    const serialized = JSON.stringify(payload);
    shared.putString(WATCHFACE_SHARED_KEY, serialized);
    if (shared.getString(WATCHFACE_SHARED_KEY, "") !== serialized) {
      console.log("[LibreMonitor] WATCHFACE_SHARE_VERIFY_FAILED");
      return false;
    }
    console.log("[LibreMonitor] WATCHFACE_SNAPSHOT_PUBLISHED");
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
