import * as hmUI from "@zos/ui";
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from "@zos/device";
import * as timer from "@zos/timer";
import { LocalStorage } from "@zos/storage";
import { queryPermission, requestPermission } from "@zos/app";
import { start, stop, getAllAppServices } from "@zos/app-service";
import { BasePage } from "@zeppos/zml/base-page";
import { normalizeReading, glucoseBand, parseGlucoseThresholds } from "../shared/glucose";
import { chartSegments, chartStrokePixels } from "../shared/chart";
import { createWatchLayout } from "../shared/watch-layout";
import { publishWatchfaceSnapshot, publishWatchfaceChartRange } from "../shared/watchface-publisher";
import { trendArrowPixels } from "../shared/trend-icon";
import { BG_DIAGNOSTIC_STORAGE_PATH, BG_SERVICE_DEBUG_KEY, BG_SNAPSHOT_STORAGE_PATH, createWatchSnapshot, readWatchSnapshot, readBackgroundSnapshot, saveWatchSnapshot, readChartRange, saveChartRange } from "../shared/watch-cache";

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
const BACKGROUND_SERVICE_PATH = "app-service/history-sync";
const watchStorage = new LocalStorage();
// Keep background-service log writes separate from the reading cache file.
// Re-open background files on every UI launch: each LocalStorage instance caches
// its loaded contents and may miss writes from a separate AppService process.

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
    this.chartMinutes = readChartRange(watchStorage);
    this.history = [];
    this.chartWidgets = [];
    this.thresholds = parseGlucoseThresholds();
    this.historyMeta = null;
    this.lastLiveAgeMinutes = null;
    this.backgroundEnabled = false;
    this.backgroundPending = false;
    this.hasCachedSnapshot = false;
    this.trendWidgets = [];
    this.activeTrend = null;
    this.activeTrendColor = null;
  },
  build() {
    this.heading = label(layout.heading, MUTED, "LIBRE MONITOR · SH ?");
    // Place the 10% larger reading and the smaller trend arrow on one row.
    // Right/left alignment keeps the arrow immediately next to 1-3 digits.
    this.value = label(layout.glucose, WHITE, "--", {
      x: layout.glucose.x, w: layout.glucose.w,
      align_h: hmUI.align.RIGHT,
    });
    // Draw a native arrow to avoid unsupported Unicode glyphs on Active 2.
    this.renderTrend(0, MUTED);
    this.units = label(layout.units, MUTED, "mg/dL");
    // Chart, labels and controls use the space freed by the old trend row.
    this.chartCaption = label(layout.chartCaption, MUTED, "LAST 2 HOURS");
    this.status = label(layout.status, MUTED, "Connecting to LibreLinkUp...");
    this.refreshBackgroundState();
    publishWatchfaceChartRange(this.chartMinutes);
    const controlWidth = Math.min(80, Math.floor((WIDTH - 94) / 3));
    const controlGap = 7;
    const controlX = Math.round((WIDTH - 3 * controlWidth - 2 * controlGap) / 2);
    this.toggleChart = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: controlX, y: layout.controls.y,
      w: controlWidth, h: layout.controls.h,
      text: "2h / 6h", text_size: layout.controls.size,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => {
        this.chartMinutes = this.chartMinutes === 120 ? 360 : 120;
        saveChartRange(watchStorage, this.chartMinutes);
        publishWatchfaceChartRange(this.chartMinutes);
        this.drawChart();
      },
    });
    this.refresh = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: controlX + controlWidth + controlGap,
      y: layout.controls.y, w: controlWidth, h: layout.controls.h,
      text: "Refresh", text_size: layout.controls.size,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => this.loadReading(),
    });
    this.backgroundButton = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: controlX + 2 * (controlWidth + controlGap),
      y: layout.controls.y, w: controlWidth, h: layout.controls.h,
      text: this.backgroundEnabled ? "BG ON" : "BG OFF",
      text_size: layout.controls.size,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => this.toggleBackground(),
    });
    this.restoreWatchSnapshot();
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
    this.clearTrendWidgets();
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
    if (!this.hasCachedSnapshot) {
      this.value.setProperty(hmUI.prop.TEXT, "--");
      this.renderTrend(0, MUTED);
    }
    this.status.setProperty(hmUI.prop.TEXT,
      this.hasCachedSnapshot ? "CACHED · " + String(message).slice(0, 29) : String(message).slice(0, 46));
  },
  restoreWatchSnapshot() {
    const foreground = readWatchSnapshot(watchStorage);
    const background = readBackgroundSnapshot(new LocalStorage(BG_SNAPSHOT_STORAGE_PATH));
    const cached = background && (!foreground || background.timestamp > foreground.timestamp)
      ? background : foreground;
    if (!cached) return;
    this.hasCachedSnapshot = true;
    this.thresholds = parseGlucoseThresholds(
      cached.thresholds?.low, cached.thresholds?.high,
      cached.thresholds?.veryLow, cached.thresholds?.veryHigh
    );
    this.history = cached.history;
    this.value.setProperty(hmUI.prop.TEXT, String(cached.value));
    this.value.setProperty(hmUI.prop.COLOR, this.glucoseColor(cached.value));
    this.renderTrend(cached.trend, this.glucoseColor(cached.value));
    const bgAge = background
      ? Math.max(0, Math.floor((Date.now() - background.savedAt) / 60_000))
      : null;
    const bgLabel = this.backgroundEnabled
      ? " · BG " + (bgAge === null ? "WAIT" : bgAge + "m")
      : "";
    this.status.setProperty(hmUI.prop.TEXT, "CACHED " + cached.ageMinutes + "m" + bgLabel);
  },
  saveWatchSnapshot(reading) {
    const snapshot = createWatchSnapshot(reading, this.thresholds);
    if (!snapshot) return;
    try {
      // This publish operation is independent of the Mini App's local cache.
      // Show a short status on the already existing debug heading, so a
      // working glucose display cannot mask a failed watchface publication.
      const shared = publishWatchfaceSnapshot(snapshot);
      this.heading?.setProperty(hmUI.prop.TEXT,
        "LIBRE MONITOR · SH " + (shared ? "OK" : "ERR"));
      if (!saveWatchSnapshot(watchStorage, snapshot)) {
        console.log("[LibreMonitor] WATCH_CACHE_VERIFY_FAILED");
        return;
      }
      this.hasCachedSnapshot = true;
      console.log("[LibreMonitor] WATCH_CACHE_SAVED");
    } catch (_) {
      console.log("[LibreMonitor] WATCH_CACHE_WRITE_FAILED");
      // Storage errors must never block live readings.
    }
  },
  refreshBackgroundState() {
    try {
      const services = getAllAppServices();
      this.backgroundEnabled = Array.isArray(services) && services.includes(BACKGROUND_SERVICE_PATH);
    } catch (_) {
      this.backgroundEnabled = false;
    }
  },
  setBackgroundState(enabled) {
    this.backgroundPending = false;
    this.backgroundEnabled = enabled;
    if (this.backgroundButton) {
      this.backgroundButton.setProperty(hmUI.prop.TEXT, enabled ? "BG ON" : "BG OFF");
    }
    this.updateHistoryStatus();
  },
  toggleBackground() {
    if (this.backgroundPending || this.destroyed) return;
    this.backgroundPending = true;
    if (this.backgroundEnabled) {
      try {
        const result = stop({
          file: BACKGROUND_SERVICE_PATH,
          complete_func: (event) => {
            if (this.destroyed) return;
            this.setBackgroundState(!event?.result);
            if (!event?.result) this.status.setProperty(hmUI.prop.TEXT, "Could not stop BG service");
          },
        });
        if (result !== 0) {
          this.setBackgroundState(true);
          this.status.setProperty(hmUI.prop.TEXT, "BG stop error: " + result);
        }
      } catch (_) {
        this.setBackgroundState(true);
        this.status.setProperty(hmUI.prop.TEXT, "BG stop not supported");
      }
      return;
    }
    let requested = false;
    const startService = () => {
      if (requested || this.destroyed) return;
      requested = true;
      try {
        const result = start({
          file: BACKGROUND_SERVICE_PATH,
          complete_func: (event) => {
            if (this.destroyed) return;
            this.setBackgroundState(Boolean(event?.result));
            if (!event?.result) this.status.setProperty(hmUI.prop.TEXT, "BG unavailable on this watch");
          },
        });
        if (result !== 0) {
          this.setBackgroundState(false);
          this.status.setProperty(hmUI.prop.TEXT, "BG error: " + result);
        }
      } catch (_) {
        this.setBackgroundState(false);
        this.status.setProperty(hmUI.prop.TEXT, "BG service not supported");
      }
    };
    try {
      const granted = queryPermission({ permissions: ["device:os.bg_service"] });
      if (Array.isArray(granted) && granted[0] === 2) {
        startService();
        return;
      }
      const result = requestPermission({
        permissions: ["device:os.bg_service"],
        callback: (values) => {
          if (this.destroyed) return;
          if (Array.isArray(values) && values[0] === 2) startService();
          else {
            this.setBackgroundState(false);
            this.status.setProperty(hmUI.prop.TEXT, "BG permission denied");
          }
        },
      });
      if (result === 2) startService();
      else if (result === 1) {
        this.setBackgroundState(false);
        this.status.setProperty(hmUI.prop.TEXT, "BG permission unavailable");
      }
    } catch (_) {
      this.setBackgroundState(false);
      this.status.setProperty(hmUI.prop.TEXT, "BG permission not supported");
    }
  },
  updateHistoryStatus() {
    if (!this.status || !Number.isFinite(this.lastLiveAgeMinutes)) return;
    const graphAge = this.historyMeta?.graphAgeMinutes;
    const backgroundSnapshot = readBackgroundSnapshot(new LocalStorage(BG_SNAPSHOT_STORAGE_PATH));
    // Only watch-side persisted data proves a background result was received.
    const bgAge = backgroundSnapshot
      ? Math.max(0, Math.floor((Date.now() - backgroundSnapshot.savedAt) / 60_000))
      : null;
    const live = "LIVE " + this.lastLiveAgeMinutes + "m";
    const graph = "GRAPH " + (Number.isFinite(graphAge) ? Math.round(graphAge) + "m" : "N/A");
    let bgText = Number.isFinite(bgAge) ? Math.round(bgAge) + "m" : "WAIT";
    if (this.backgroundEnabled) {
      try {
        const diagnostic = new LocalStorage(BG_DIAGNOSTIC_STORAGE_PATH).getItem(BG_SERVICE_DEBUG_KEY);
        if (Number.isFinite(diagnostic?.timestamp) &&
            diagnostic.timestamp >= Date.now() - 20 * 60_000) {
          const codes = {
            NO_BRIDGE: "NO LINK",
            REQUESTED: "REQUEST",
            FAILED: "FAILED",
            UNAVAILABLE: "NO DATA",
            STARTED: "STARTED",
            TIMEOUT: "TIMEOUT",
            OK: "OK",
            SAVED: "SAVED",
            SAVE_FAILED: "SAVE ERR",
            INVALID_DATA: "BAD DATA",
            TICK: "TICK",
          };
          if (!Number.isFinite(bgAge)) bgText = codes[diagnostic.state] || bgText;
        }
      } catch (_) {
        // Missing diagnostic information is not a reading failure.
      }
    }
    const bg = this.backgroundEnabled ? " · BG " + bgText : "";
    this.status.setProperty(hmUI.prop.TEXT, live + " · " + graph + bg);
  },
  clearTrendWidgets() {
    for (const widget of this.trendWidgets) hmUI.deleteWidget(widget);
    this.trendWidgets = [];
  },
  renderTrend(trend, color) {
    const code = Number(trend);
    const normalized = Number.isInteger(code) && code >= 1 && code <= 5 ? code : 0;
    const arrowColor = normalized ? color : MUTED;
    if (this.activeTrend === normalized && this.activeTrendColor === arrowColor) return;
    this.clearTrendWidgets();
    this.activeTrend = normalized;
    this.activeTrendColor = arrowColor;
    if (!normalized) {
      this.trendWidgets.push(hmUI.createWidget(hmUI.widget.CIRCLE, {
        center_x: layout.arrow.x + Math.round(layout.arrow.w / 2),
        center_y: layout.arrow.y + Math.round(layout.arrow.h / 2),
        radius: 4, color: MUTED,
      }));
    } else {
      for (const pixel of trendArrowPixels(normalized, layout.arrow.w, layout.arrow.h)) {
        this.trendWidgets.push(hmUI.createWidget(hmUI.widget.FILL_RECT, {
          x: layout.arrow.x + pixel.x - 2,
          y: layout.arrow.y + pixel.y - 2,
          w: 5, h: 5, color: arrowColor,
        }));
      }
    }
    hmUI.redraw();
  },
  clearChartWidgets() {
    for (const widget of this.chartWidgets) hmUI.deleteWidget(widget);
    this.chartWidgets = [];
  },
  addChartWidget(type, options) {
    this.chartWidgets.push(hmUI.createWidget(type, options));
  },
  glucoseColor(value) {
    const band = glucoseBand(value, this.thresholds);
    return band === "target" ? GREEN :
      band === "very-low" || band === "very-high" ? RED : AMBER;
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
        w: 3, h: 3, color: this.glucoseColor(pixel.value),
      });
    }
    // Dashed connectors mark 21-30 minute gaps anywhere in the history.
    const bridgePixels = chartStrokePixels(graph.lines.filter((line) => line.dashed), 25);
    for (let i = 0; i < bridgePixels.length; i++) {
      if (i % 3 === 2) continue;
      const pixel = bridgePixels[i];
      this.addChartWidget(hmUI.widget.FILL_RECT, {
        x: ox + pixel.x - 1, y: oy + pixel.y - 1,
        w: 3, h: 3, color: this.glucoseColor(pixel.value),
      });
    }
    // Show one actual measurement per five-minute bucket.
    for (const dot of graph.dots) {
      this.addChartWidget(hmUI.widget.CIRCLE, {
        center_x: ox + dot.x, center_y: oy + dot.y,
        radius: 3, color: this.glucoseColor(dot.value),
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
    if (!this.hasCachedSnapshot) this.status.setProperty(hmUI.prop.TEXT, "Connecting to phone...");
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
        if (!this.hasCachedSnapshot) this.status.setProperty(hmUI.prop.TEXT, "Phone OK, contacting Libre...");
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
        this.thresholds = parseGlucoseThresholds(
          response.thresholds?.low, response.thresholds?.high,
          response.thresholds?.veryLow, response.thresholds?.veryHigh
        );
        this.history = Array.isArray(response.reading.history) ? response.reading.history : [];
        this.historyMeta = response.reading.historyMeta || null;
        this.lastLiveAgeMinutes = ageMinutes;
        this.drawChart();
        const color = this.glucoseColor(reading.value);
        this.value.setProperty(hmUI.prop.TEXT, String(reading.value));
        this.value.setProperty(hmUI.prop.COLOR, color);
        this.renderTrend(reading.trend, color);
        this.updateHistoryStatus();
        this.saveWatchSnapshot(response.reading);
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
