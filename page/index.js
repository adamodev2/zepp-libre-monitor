import * as hmUI from "@zos/ui";
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from "@zos/device";
import * as timer from "@zos/timer";
import { BasePage } from "@zeppos/zml/base-page";
import { normalizeReading, trendArrow, glucoseBand } from "../shared/glucose";
import { chartSegments, chartStrokePixels } from "../shared/chart";
import { createWatchLayout } from "../shared/watch-layout";

const device = getDeviceInfo();
const WIDTH = device.width || 466;
const HEIGHT = device.height || 466;
const isSquare = device.screenShape === SCREEN_SHAPE_SQUARE;
const layout = createWatchLayout(WIDTH, HEIGHT, isSquare);
const WHITE = 0xffffff;
const MUTED = 0xa4b0bb;
const GREEN = 0x41d98a;
const RED = 0xff5d68;
const AMBER = 0xffc247;
const REFRESH_INTERVAL_MS = 60_000;
const MAX_READING_AGE_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

function label(frame, color, text, options = {}) {
  return hmUI.createWidget(hmUI.widget.TEXT, {
    x: 25, y: frame.y, w: WIDTH - 50, h: frame.h,
    color, text_size: frame.size,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.ELLIPSIS,
    text,
    ...options,
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
    this.chartWidgets = [];
  },
  build() {
    this.heading = label(layout.heading, MUTED, "LIBRE MONITOR");
    // Place the 10% larger reading and the smaller trend arrow on one row.
    // Right/left alignment keeps the arrow immediately next to 1-3 digits.
    this.value = label(layout.glucose, WHITE, "--", {
      x: layout.glucose.x, w: layout.glucose.w,
      align_h: hmUI.align.RIGHT,
    });
    this.trend = label(layout.arrow, WHITE, "·", {
      x: layout.arrow.x, w: layout.arrow.w,
      align_h: hmUI.align.LEFT,
    });
    this.units = label(layout.units, MUTED, "mg/dL");
    // Chart, labels and controls use the space freed by the old trend row.
    this.chartCaption = label(layout.chartCaption, MUTED, "LAST 2 HOURS");
    this.status = label(layout.status, MUTED, "Connecting to LibreLinkUp...");
    this.toggleChart = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: layout.controls.x, y: layout.controls.y,
      w: layout.controls.w, h: layout.controls.h,
      text: "2h / 6h", text_size: layout.controls.size,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => {
        this.chartMinutes = this.chartMinutes === 120 ? 360 : 120;
        this.drawChart();
      },
    });
    this.refresh = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: layout.controls.x + layout.controls.w + layout.controls.gap,
      y: layout.controls.y, w: layout.controls.w, h: layout.controls.h,
      text: "Refresh", text_size: layout.controls.size,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => this.loadReading(),
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
    this.clearChartWidgets();
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
    this.status.setProperty(hmUI.prop.TEXT, String(message).slice(0, 46));
  },
  clearChartWidgets() {
    for (const widget of this.chartWidgets) hmUI.deleteWidget(widget);
    this.chartWidgets = [];
  },
  addChartWidget(type, options) {
    this.chartWidgets.push(hmUI.createWidget(type, options));
  },
  drawChart() {
    const width = layout.chart.w, height = layout.chart.h;
    const graph = chartSegments(this.history, this.chartMinutes, width, height);
    this.clearChartWidgets();
    const gapLabel = graph.maxGapMinutes ? ` · GAP ${Math.round(graph.maxGapMinutes)}m` : "";
    this.chartCaption.setProperty(hmUI.prop.TEXT, `LAST ${this.chartMinutes === 120 ? "2 HOURS" : "6 HOURS"} · ${graph.count} PTS${gapLabel}`);
    const ox = layout.chart.x;
    const oy = layout.chart.y;
    const axisColor = 0x436078;
    this.addChartWidget(hmUI.widget.FILL_RECT, {
      x: ox, y: oy + height - 1, w: width, h: 1, color: axisColor,
    });
    this.addChartWidget(hmUI.widget.FILL_RECT, {
      x: ox, y: oy, w: 1, h: height, color: axisColor,
    });
    // Draw connectors and measurement dots in the SAME absolute screen coordinates.
    // Avoid GRADKIENT_POLYLINE: its device-local bottom-origin coordinate system
    // did not align with CIRCLE markers on the physical Active 2.
    for (const pixel of chartStrokePixels(graph.lines.filter((line) => !line.dashed), 140)) {
      this.addChartWidget(hmUI.widget.FILL_RECT, {
        x: ox + pixel.x - 1, y: oy + pixel.y - 1,
        w: 3, h: 3, color: GREEN,
      });
    }
    // Dashed connectors mark 21-30 minute gaps anywhere in the history.
    const bridgePixels = chartStrokePixels(graph.lines.filter((line) => line.dashed), 25);
    for (let i = 0; i < bridgePixels.length; i++) {
      if (i % 3 === 2) continue;
      const pixel = bridgePixels[i];
      this.addChartWidget(hmUI.widget.FILL_RECT, {
        x: ox + pixel.x - 1, y: oy + pixel.y - 1,
        w: 3, h: 3, color: GREEN,
      });
    }
    // Show one actual measurement per five-minute bucket.
    for (const dot of graph.dots) {
      this.addChartWidget(hmUI.widget.CIRCLE, {
        center_x: ox + dot.x, center_y: oy + dot.y,
        radius: 3, color: GREEN,
      });
    }
    if (graph.count === 0) {
      this.addChartWidget(hmUI.widget.TEXT, {
        x: ox + 35, y: oy + 22, w: 190, h: 40,
        text: "NO HISTORY", text_size: 18, color: MUTED,
        align_h: hmUI.align.CENTER_H,
      });
    }
    hmUI.redraw();
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
