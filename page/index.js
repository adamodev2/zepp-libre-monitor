import * as hmUI from "@zos/ui";
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from "@zos/device";
import * as timer from "@zos/timer";
import { BasePage } from "@zeppos/zml/base-page";
import { normalizeReading, trendArrow, glucoseBand } from "../shared/glucose";
import { chartSegments } from "../shared/chart";

const device = getDeviceInfo();
const WIDTH = device.width || 466;
const HEIGHT = device.height || 466;
const isSquare = device.screenShape === SCREEN_SHAPE_SQUARE;
const layout = isSquare
  ? { heading: 22, value: 72, units: 168, trend: 197, chart: 260, status: 365, button: HEIGHT - 58 }
  : { heading: 35, value: 78, units: 174, trend: 210, chart: 268, status: 374, button: HEIGHT - 61 };
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
    this.chartMinutes = 120;
    this.history = [];
  },
  build() {
    this.heading = label(layout.heading, 32, 25, MUTED, "LIBRE MONITOR");
    this.value = label(layout.value, 100, 84, WHITE, "--");
    this.units = label(layout.units, 34, 23, MUTED, "mg/dL");
    this.trend = label(layout.trend, 45, 36, WHITE, "·");
    this.chart = hmUI.createWidget(hmUI.widget.CANVAS, {
      x: Math.round((WIDTH - 260) / 2), y: layout.chart, w: 260, h: 92,
    });
    this.chartCaption = label(layout.chart - 25, 23, 17, MUTED, "LAST 2 HOURS");
    this.status = label(layout.status, 27, 16, MUTED, "Connecting to LibreLinkUp...");
    this.refresh = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: Math.round(WIDTH / 2) + 4, y: layout.button, w: 108, h: 41,
      text: "Refresh", text_size: 17,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => this.loadReading(),
    });
    this.toggleChart = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: Math.round(WIDTH / 2) - 112, y: layout.button, w: 108, h: 41,
      text: "1h / 2h", text_size: 16,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 18,
      click_func: () => {
        this.chartMinutes = this.chartMinutes === 120 ? 60 : 120;
        this.drawChart();
      },
    });
    this.drawChart();
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
  drawChart() {
    if (!this.chart) return;
    const width = 260, height = 92;
    this.chart.clear({ x: 0, y: 0, w: width, h: height });
    const graph = chartSegments(this.history, this.chartMinutes, width, height);
    this.chartCaption.setProperty(hmUI.prop.TEXT, `LAST ${this.chartMinutes === 60 ? "1 HOUR" : "2 HOURS"} · ${graph.count} PTS`);
    this.chart.setPaint({ color: 0x436078, line_width: 1 });
    this.chart.drawLine({ x1: 0, y1: height - 1, x2: width - 1, y2: height - 1, color: 0x436078 });
    this.chart.drawLine({ x1: 0, y1: 0, x2: 0, y2: height - 1, color: 0x436078 });
    this.chart.setPaint({ color: GREEN, line_width: 2 });
    for (const line of graph.lines) this.chart.drawLine({ ...line, color: GREEN });
    // Abbott history may contain only one observation every 15 minutes.
    // Always draw each actual point, including isolated samples.
    for (const dot of graph.dots) {
      this.chart.drawCircle({ center_x: dot.x, center_y: dot.y, radius: 2, color: GREEN });
    }
    if (graph.count === 0) {
      this.chart.drawText({ x: 68, y: 29, text: "NO HISTORY", text_size: 18, color: MUTED });
    }
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
        // Use the phone clock because watch time may not match Abbott UTC timestamps.
        const ageMs = Number(response.reading?.ageMs);
        if (response.reading?.ageMs === null || !Number.isFinite(ageMs)) throw new Error("Reading has invalid UTC timestamp");
        const ageMinutes = Math.floor(ageMs / 60_000);
        if (ageMs < -60_000 || ageMs > MAX_READING_AGE_MS) throw new Error("Reading unavailable or older than 15 min");
        this.history = Array.isArray(response.reading.history) ? response.reading.history : [];
        this.drawChart();
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
