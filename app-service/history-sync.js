import { Time } from "@zos/sensor";
import { LocalStorage } from "@zos/storage";
import { BG_SERVICE_DEBUG_KEY } from "../shared/watch-cache";
import { BasePage } from "@zeppos/zml/base-page";

const SYNC_INTERVAL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 2 * 60_000;
const timeSensor = new Time();
const diagnosticStorage = new LocalStorage();

function trackBackground(state, now = timeSensor.getTime()) {
  try {
    diagnosticStorage.setItem(BG_SERVICE_DEBUG_KEY, { state, timestamp: now });
  } catch (_) {
    // Diagnostics must not block the background service.
  }
}

// Experimental background synchronization. The service is never started
// automatically: the watch user explicitly opts in and grants permission.
// Network requests are delegated to the phone-side LibreLinkUp service.
AppService(BasePage({
  onInit() {
    this.lastAttempt = 0;
    this.inFlight = false;
    this.inFlightSince = 0;
    this.requestId = 0;
    this.stopped = false;

    trackBackground("STARTED");
    timeSensor.onPerMinute(() => this.syncIfDue());
    this.syncIfDue();
  },

  syncIfDue() {
    if (this.stopped) return;
    const now = timeSensor.getTime();
    if (this.inFlight && now - this.inFlightSince >= REQUEST_TIMEOUT_MS) {
      this.inFlight = false;
      this.requestId += 1;
      trackBackground("TIMEOUT", now);
      console.log("[LibreMonitor] BG_SYNC_TIMEOUT");
    }
    if (this.inFlight) return;
    if (this.lastAttempt && now - this.lastAttempt < SYNC_INTERVAL_MS - 20_000) return;

    if (typeof this.request !== "function") {
      trackBackground("NO_BRIDGE", now);
      console.log("[LibreMonitor] BG_BRIDGE_NOT_AVAILABLE");
      return;
    }
    this.lastAttempt = now;
    this.inFlight = true;
    this.inFlightSince = now;
    const requestId = ++this.requestId;
    trackBackground("REQUESTED", now);
    let request;
    try {
      request = this.request({ method: "BACKGROUND_SYNC" });
    } catch (_) {
      this.inFlight = false;
      trackBackground("FAILED");
      console.log("[LibreMonitor] BG_SYNC_THROW");
      return;
    }
    Promise.resolve(request)
      .then((result) => {
        if (this.stopped || requestId !== this.requestId) return;
        trackBackground(result?.ok ? "OK" : "UNAVAILABLE");
        console.log(result?.ok ? "[LibreMonitor] BG_SYNC_OK" : "[LibreMonitor] BG_SYNC_UNAVAILABLE");
      })
      .catch(() => {
        if (this.stopped || requestId !== this.requestId) return;
        // The phone may be disconnected or Zepp may suspend its Side Service.
        trackBackground("FAILED");
        console.log("[LibreMonitor] BG_SYNC_FAILED");
      })
      .finally(() => {
        if (requestId === this.requestId) {
          this.inFlight = false;
          this.inFlightSince = 0;
        }
      });
  },

  onDestroy() {
    this.stopped = true;
    this.requestId += 1;
  },
}));
