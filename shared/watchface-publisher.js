import { ShareTypedStorage } from "@zos/storage";
import {
  WATCHFACE_SHARED_SCOPE,
  WATCHFACE_SHARED_KEY,
  createWatchfacePayload,
} from "./watchface-data";

// The Mini App and AppService are the only publishers.
// This module never runs in the watchface package.
export function publishWatchfaceSnapshot(snapshot) {
  try {
    const payload = createWatchfacePayload(snapshot);
    if (!payload) return false;
    const shared = new ShareTypedStorage(WATCHFACE_SHARED_SCOPE);
    shared.putString(WATCHFACE_SHARED_KEY, JSON.stringify(payload));
    console.log("[LibreMonitor] WATCHFACE_SNAPSHOT_PUBLISHED");
    return true;
  } catch (_) {
    console.log("[LibreMonitor] WATCHFACE_SHARE_UNAVAILABLE");
    return false;
  }
}
