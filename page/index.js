import * as hmUI from "@zos/ui";
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from "@zos/device";
import * as timer from "@zos/timer";
import { BasePage } from "@zeppos/zml/base-page";
import { normalizeReading, trendArrow, glucoseBand } from "../shared/glucose";

const device = getDeviceInfo();
const WIDTH = device.width || 466;
const HEIGHT = device.height || 466;
const isSquare = device.screenShape === SCREEN_SHAPE_SQUARE;
const layout = isSquare
  ? { heading: 42, value: 105, units: 201, trend: 252, status: 320, button: HEIGHT - 65 }
  : { heading: 54, value: 125, units: 225, trend: 270, status: 335, button: HEIGHT - 81 };
const WHITE = 0xffffff;
const MUTED = 0xa4b0bb;
const GREEN = 0x41d98a;
const RED = 0xff5d68;
const AMBER = 0xffc247;
const REFRESH_INTERVAL_MS = 60_000;
const MAX_READING_AGE_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

function label(y, height, size, color, text) {
  return hmUI.createWidget(hmUI.widget.TEXT, {
    x: 25, y, w: WIDTH - 50, h: height,
    color, text_size: size,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text,
  });
}

Page(BasePage({
  onInit() {
    this.refreshTimer = null;
    this.watchdogTimer = null;
    this.requestSequence = 0;
    this.requestInFlight = false;
    this.destroyed = false;
  },
  build() {
    this.heading = label(layout.heading, 32, 25, MUTED, "LIBRE MONITOR");
    this.value = label(layout.value, 100, 84, WHITE, "--");
    this.units = label(layout.units, 34, 23, MUTED, "mg/dL");
    this.trend = label(layout.trend, 45, 36, WHITE, "·");
    this.status = label(layout.status, 28, 18, MUTED, "Connecting to LibreLinkUp...");
    this.refresh = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: Math.round((WIDTH - 170) / 2), y: layout.button, w: 170, h: 48,
      text: "Refresh", text_size: 20,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => this.loadReading(),
    });
    this.loadReading();
    this.refreshTimer = timer.createTimer(
      REFRESH_INTERVAL_MS,
      REFRESH_INTERVAL_MS,
      () => this.loadReading(),
      {}
    );
  },
  onDestroy() {
    this.destroyed = true;
    if (this.refreshTimer !== null) {
      timer.stopTimer(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.stopWatchdog();
    this.requestSequence += 1;
  },
  stopWatchdog() {
    if (this.watchdogTimer !== null) {
      timer.stopTimer(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  },
  finishRequest(sequence) {
    if (sequence !== this.requestSequence) return;
    this.stopWatchdog();
    this.requestInFlight = false;
  },
  showError(message) {
    this.value.setProperty(hmUI.prop.TEXT, "--");
    this.trend.setProperty(hmUI.prop.TEXT, "·");
    this.status.setProperty(hmUI.prop.TEXT, String(message).slice(0, 58));
  },
  loadReading() {
    if (this.requestInFlight || this.destroyed) return;
    this.requestInFlight = true;
    const sequence = ++this.requestSequence;
    this.status.setProperty(hmUI.prop.TEXT, "Connecting to phone...");
    this.stopWatchdog();
    this.watchdogTimer = timer.createTimer(REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS, () => {
      if (this.destroyed || this.requestSequence !== sequence) return;
      this.finishRequest(sequence);
      this.requestSequence += 1;
      this.showError("Timeout: no reply from Zepp phone service");
    }, {});
    this.request({ method: "PING" })
      .then((ping) => {
        if (!ping || ping.ok !== true) {
          throw new Error("Phone service PING failed");
        }
        if (this.destroyed || sequence !== this.requestSequence) return null;
        this.status.setProperty(hmUI.prop.TEXT, "Phone OK, contacting Libre...");
        return this.request({ method: "GET_GLUCOSE" });
      })
      .then((response) => {
        if (this.destroyed || sequence !== this.requestSequence) return;
        if (!response) throw new Error("Empty response from phone");
        if (response.error) throw new Error(response.error);
        const reading = normalizeReading(response.reading);
        const ageMs = reading.timestamp ? Date.now() - reading.timestamp : Infinity;
        const ageMinutes = Math.floor(ageMs / 60_000);
        if (ageMs < -60_000 || ageMs > MAX_READING_AGE_MS) throw new Error("Reading unavailable or older than 15 min");
        const band = glucoseBand(reading.value);
        const color = band === "low" ? RED : band === "high" ? AMBER : GREEN;
        this.value.setProperty(hmUI.prop.TEXT, String(reading.value));
        this.value.setProperty(hmUI.prop.COLOR, color);
        this.trend.setProperty(hmUI.prop.TEXT, trendArrow(reading.trend));
        this.status.setProperty(hmUI.prop.TEXT, `LibreLinkUp · ${ageMinutes} min ago`);
      })
      .catch((error) => {
        if (this.destroyed || sequence !== this.requestSequence) return;
        this.showError(error.message || "No LibreLinkUp data");
      })
      .finally(() => {
        this.finishRequest(sequence);
      });
  },
}));
