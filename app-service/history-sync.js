import { Time } from "@zos/sensor";
import { BasePage } from "@zeppos/zml/base-page";

const SYNC_INTERVAL_MS = 5 * 60_000;
const timeSensor = new Time();

// Experimental background synchronization. The service is never started
// automatically: the watch user explicitly opts in and grants permission.
// Network requests are delegated to the phone-side LibreLinkUp service.
AppService(BasePage({
  onInit() {
    this.lastAttempt = 0;
    this.inFlight = false;
    this.stopped = false;

    timeSensor.onPerMinute(() => this.syncIfDue());
    this.syncIfDue();
  },

  syncIfDue() {
    if (this.stopped || this.inFlight) return;
    const now = timeSensor.getTime();
    if (this.lastAttempt && now - this.lastAttempt < SYNC_INTERVAL_MS - 20_000) return;

    if (typeof this.request !== "function") {
      console.log("[LibreMonitor] BG_BRIDGE_NOT_AVAILABLE");
      return;
    }
    this.lastAttempt = now;
    this.inFlight = true;
    this.request({ method: "BACKGROUND_SYNC" })
      .then((result) => {
        console.log(result?.ok ? "[LibreMonitor] BG_SYNC_OK" : "[LibreMonitor] BG_SYNC_UNAVAILABLE");
      })
      .catch(() => {
        // The phone may be disconnected or Zepp may suspend its Side Service.
        console.log("[LibreMonitor] BG_SYNC_FAILED");
      })
      .finally(() => {
        this.inFlight = false;
      });
  },

  onDestroy() {
    this.stopped = true;
  },
}));
