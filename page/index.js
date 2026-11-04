import * as hmUI from "@zos/ui";
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from "@zos/device";
import * as timer from "@zos/timer";
import { BasePage } from "@zeppos/zml/base-page";
import { queryPermission, requestPermission } from "@zos/app";
import { start, stop, getAllAppServices } from "@zos/app-service";
import { normalizeReading, trendArrow, glucoseBand } from "../shared/glucose";
import { chartSegments, chartStrokePixels } from "../shared/chart";

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
const BACKGROUND_SERVICE_PATH = "app-service/history-sync";

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
    this.chartWidgets = [];
    this.historyMeta = null;
    this.backgroundEnabled = false;
    this.backgroundPending = false;
  },
  build() {
    this.heading = label(layout.heading, 32, 25, MUTED, "LIBRE MONITOR");
    this.value = label(layout.value, 100, 84, WHITE, "--");
    this.units = label(layout.units, 34, 23, MUTED, "mg/dL");
    this.trend = label(layout.trend, 45, 36, WHITE, "·");
    // Use native Zepp widgets instead of CANVAS, which rendered blank on Active 2.
    this.chartOriginX = Math.round((WIDTH - 260) / 2);
    this.chartCaption = label(layout.chart - 25, 23, 17, MUTED, "LAST 2 HOURS");
    this.historyStatus = label(layout.chart + 90, 18, 14, MUTED, "ABBOTT GRAPH: CHECKING");
    this.status = label(layout.status + 5, 23, 15, MUTED, "Connecting to LibreLinkUp...");
    this.refreshBackgroundState();
    const controlWidth = 82;
    const controlGap = 7;
    const controlsX = Math.round((WIDTH - 3 * controlWidth - 2 * controlGap) / 2);
    this.toggleChart = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: controlsX, y: layout.button, w: controlWidth, h: 41,
      text: "2h / 6h", text_size: 15,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 18,
      click_func: () => {
        this.chartMinutes = this.chartMinutes === 120 ? 360 : 120;
        this.drawChart();
      },
    });
    this.refresh = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: controlsX + controlWidth + controlGap, y: layout.button, w: controlWidth, h: 41,
      text: "Refresh", text_size: 15,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 18,
      click_func: () => this.loadReading(),
    });
    this.backgroundButton = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: controlsX + 2 * (controlWidth + controlGap),
      y: layout.button, w: controlWidth, h: 41,
      text: this.backgroundEnabled ? "BG ON" : "BG OFF", text_size: 15,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 18,
      click_func: () => this.toggleBackground(),
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
    this.status.setProperty(hmUI.prop.TEXT, String(message).slice(0, 58));
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
    if (this.backgroundPending) return;
    this.backgroundPending = true;
    if (this.backgroundEnabled) {
      const result = stop({
        file: BACKGROUND_SERVICE_PATH,
        complete_func: (event) => {
          this.setBackgroundState(!event?.result);
          if (!event?.result) {
            this.status.setProperty(hmUI.prop.TEXT, "Could not stop background service");
          }
        },
      });
      if (result !== 0) {
        this.setBackgroundState(true);
        this.status.setProperty(hmUI.prop.TEXT, `Background stop error: ${result}`);
      }
      return;
    }

    const startService = () => {
      try {
        const result = start({
          file: BACKGROUND_SERVICE_PATH,
          complete_func: (event) => {
            this.setBackgroundState(Boolean(event?.result));
            if (!event?.result) {
              this.status.setProperty(hmUI.prop.TEXT, "BG unavailable on this installation");
            }
          },
        });
        if (result !== 0) {
          this.setBackgroundState(false);
          this.status.setProperty(hmUI.prop.TEXT, `BG unavailable (code ${result})`);
        }
      } catch (_) {
        this.setBackgroundState(false);
        this.status.setProperty(hmUI.prop.TEXT, "Background service not supported");
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
        callback: (permissions) => {
          if (Array.isArray(permissions) && permissions[0] === 2) {
            startService();
          } else {
            this.setBackgroundState(false);
            this.status.setProperty(hmUI.prop.TEXT, "BG permission denied or unavailable");
          }
        },
      });
      if (result === 2) startService();
      else if (result === 1) {
        this.setBackgroundState(false);
        this.status.setProperty(hmUI.prop.TEXT, "BG permission not available");
      }
    } catch (_) {
      this.setBackgroundState(false);
      this.status.setProperty(hmUI.prop.TEXT, "BG permission not supported");
    }
  },
  updateHistoryStatus() {
    if (!this.historyStatus) return;
    const graphAge = this.historyMeta?.graphAgeMinutes;
    const bgAge = this.historyMeta?.backgroundSyncAgeMinutes;
    const graphText = Number.isFinite(graphAge)
      ? `ABBOTT GRAPH ${Math.round(graphAge)}m OLD`
      : "ABBOTT GRAPH UNAVAILABLE";
    const bgText = this.backgroundEnabled
      ? ` · BG ${Number.isFinite(bgAge) ? Math.round(bgAge) + "m" : "WAIT"}`
      : "";
    this.historyStatus.setProperty(hmUI.prop.TEXT, graphText + bgText);
  },
  clearChartWidgets() {
    for (const widget of this.chartWidgets) hmUI.deleteWidget(widget);
    this.chartWidgets = [];
  },
  addChartWidget(type, options) {
    this.chartWidgets.push(hmUI.createWidget(type, options));
  },
  drawChart() {
    const width = 260, height = 92;
    const graph = chartSegments(this.history, this.chartMinutes, width, height);
    this.clearChartWidgets();
    const gapLabel = graph.maxGapMinutes ? ` · GAP ${Math.round(graph.maxGapMinutes)}m` : "";
    this.chartCaption.setProperty(hmUI.prop.TEXT, `LAST ${this.chartMinutes === 120 ? "2 HOURS" : "6 HOURS"} · ${graph.count} PTS${gapLabel}`);
    const ox = this.chartOriginX;
    const oy = layout.chart;
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
        this.historyMeta = response.reading.historyMeta || null;
        this.drawChart();
        this.updateHistoryStatus();
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
