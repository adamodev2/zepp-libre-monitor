import * as hmUI from "@zos/ui";
import { Time, Battery, HeartRate, Wear, Screen } from "@zos/sensor";
import * as timer from "@zos/timer";
import { getSettings } from "@zos/display";
import { isHeartRateDisplayable } from "../lib/heart-confidence";
import { TypedStorage } from "@zos/share-storage";
import { LocalStorage } from "@zos/storage";
import { selectReliableGlucoseRaw } from "../lib/reliable-glucose";
import { getScene, SCENE_AOD } from "@zos/app";
import {
  STALE_AFTER_MINUTES, parseGlucoseSnapshot,
  readingColor, chartCoordinates, linePixels,
} from "../lib/model";

const APP_ID = 1092841;
const SHARED_SCOPE = "libre-glucose-face-v1";
const SHARED_KEY = "snapshot";
const SHARED_READING_KEY = "reading";
const LOCAL_CACHE_KEY = "libre_diagnostic_face_last_valid_v1";
const CHART_RANGE_KEY = "chart_range_minutes";
const FOREGROUND_REFRESH_MS = 30_000;
const WHITE = 0xffffff;
const MUTED = 0xa7b3be;
const FAINT = 0x536574;
const GRAPH_X = 82;
const GRAPH_Y = 335;
const GRAPH_W = 302;
const GRAPH_H = 59;
const TREND_DIRECTIONS = {
  1: [0, 1], 2: [1, 1], 3: [1, 0], 4: [1, -1], 5: [0, -1],
};

function addText(x, y, w, h, size, color, text, showLevel = hmUI.show_level.ONLY_NORMAL) {
  return hmUI.createWidget(hmUI.widget.TEXT, {
    x, y, w, h, color, text_size: size, show_level: showLevel,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.NONE,
    text,
  });
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTime(clock) {
  return pad2(clock.getHours()) + ":" + pad2(clock.getMinutes());
}

function formatDate(clock) {
  return pad2(clock.getDate()) + "." + pad2(clock.getMonth()) + "." +
    clock.getFullYear();
}

function drawLinePixels(draw, x1, y1, x2, y2, color) {
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.max(1, Math.ceil(length / 3));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + (x2 - x1) * i / steps);
    const y = Math.round(y1 + (y2 - y1) * i / steps);
    draw(hmUI.widget.FILL_RECT, {
      x, y, w: 4, h: 4, color, show_level: hmUI.show_level.ONLY_NORMAL,
    });
  }
}

WatchFace({
  onInit() {
    this.clock = new Time();
    this.battery = null;
    this.heart = null;
    this.wear = null;
    this.screen = null;
    this.screenCallback = null;
    try { this.screen = new Screen(); } catch (_) { /* Screen status unavailable */ }
    try { this.wear = new Wear(); } catch (_) { /* Wear detection unavailable */ }
    try { this.battery = new Battery(); } catch (_) { /* Not available */ }
    try { this.heart = new HeartRate(); } catch (_) { /* Permission needed */ }
    this.chartWidgets = [];
    this.trendWidgets = [];
    this.lastRaw = "";
    this.cacheStorage = null;
    try {
      this.cacheStorage = new LocalStorage();
      const saved = this.cacheStorage.getItem(LOCAL_CACHE_KEY, "");
      this.lastRaw = typeof saved === "string" ? saved : "";
    } catch (_) {
      // Shared storage remains available even when local cache is denied.
    }
    this.destroyed = false;
    this.heartCallback = null;
    this.heartListening = false;
    this.wearCallback = null;
    this.pollTimer = null;
    this.currentBpm = null;
    this.bpmMeasuredAt = 0;
    this.wearingSince = 0;
    this.heartEventCount = 0;
    this.lastWearStatus = null;
    this.chartMinutes = 360;
  },

  build() {
    // Zepp uses widget show_level to select the normal vs. AOD view.
    // A getScene() branch during build is not sufficient when the screen dims.
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0, w: 466, h: 466,
      color: 0x050b12, show_level: hmUI.show_level.ONLY_NORMAL,
    });
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0, w: 466, h: 466,
      color: 0x000000, show_level: hmUI.show_level.ONAL_AOD,
    });

    // Normal face: time is dominant; glucose remains secondary.
    this.timeText = addText(39, 49, 388, 123, 114, WHITE, "--:--");
    this.dateText = addText(90, 170, 286, 33, 30, MUTED, "--.--.----");
    this.glucoseText = addText(111, 204, 235, 75, 72, WHITE, "--");
    this.unitsText = addText(134, 266, 198, 27, 26, MUTED, "mg/dL");
    this.ageText = addText(108, 292, 250, 29, 25, MUTED, "NO CGM DATA");
    this.chartLabel = addText(102, 318, 262, 25, 23, MUTED, "GLUCOSE · 6H");
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: GRAPH_X, y: GRAPH_Y + GRAPH_H - 1,
      w: GRAPH_W, h: 1, color: FAINT,
      show_level: hmUI.show_level.ONLY_NORMAL,
    });
    this.heartText = addText(84, 399, 148, 37, 30, WHITE, "-- BPM");
    this.wearDebugText = addText(109, 427, 98, 25, 20, MUTED, "WRIST ?");
    this.batteryText = addText(235, 400, 147, 37, 30, WHITE, "--%");

    // Lightweight AOD view; Zepp displays these widgets only when resting.
    // The OS must also be configured to follow the current watch face.
    const aod = hmUI.show_level.ONAL_AOD;
    this.aodTimeText = addText(83, 120, 300, 95, 87, WHITE, "--:--", aod);
    this.aodDateText = addText(98, 215, 270, 34, 25, MUTED, "--.--.----", aod);
    this.aodGlucoseText = addText(129, 269, 208, 74, 66, WHITE, "--", aod);
    this.aodAgeText = addText(85, 344, 296, 33, 23, MUTED, "NO CGM DATA", aod);
    // Static marker proves that Zepp selected our AOD instead of a system style.
    this.aodMarker = addText(133, 387, 200, 26, 19, MUTED, "LIBRE AOD", aod);

    // Refresh whenever UI returns from another screen; the minute callback
    // also refreshes the independent AOD instance where supported.
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        if (this.destroyed) return;
        this.refresh();
        this.syncHeartMonitoring();
        this.startForegroundRefresh();
      },
      pause_call: () => {
        this.stopForegroundRefresh();
        this.stopHeartMonitoring();
      },
    });

    this.refresh();
    if (this.wear) {
      try {
        this.wearCallback = () => {
          this.syncHeartMonitoring();
          this.updateHeartText();
        };
        this.wear.onChange(this.wearCallback);
      } catch (_) {
        this.wearCallback = null;
      }
    }
    if (this.screen) {
      try {
        this.screenCallback = (status) => {
          if (this.destroyed) return;
          if (status === 1) {
            this.refresh();
            this.syncHeartMonitoring();
            this.startForegroundRefresh();
          } else {
            this.stopForegroundRefresh();
            this.stopHeartMonitoring();
            this.updateHeartText();
          }
        };
        this.screen.onChange(this.screenCallback);
      } catch (_) {
        this.screenCallback = null;
      }
    }
    this.syncHeartMonitoring();
    this.startForegroundRefresh();
    this.clock.onPerMinute(() => {
      if (!this.destroyed) this.refresh();
    });
  },

  clearWidgets(name) {
    const widgets = this[name] || [];
    for (const widget of widgets) hmUI.deleteWidget(widget);
    this[name] = [];
  },

  drawTrend(trend, color) {
    this.clearWidgets("trendWidgets");
    const direction = TREND_DIRECTIONS[trend];
    if (!direction) return;
    const [dx, dy] = direction;
    const length = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / length, uy = dy / length;
    const tipX = 355 + ux * 17, tipY = 236 + uy * 17;
    const tailX = 355 - ux * 17, tailY = 236 - uy * 17;
    const add = (widget, opts) => this.trendWidgets.push(hmUI.createWidget(widget, opts));
    drawLinePixels(add, tailX, tailY, tipX, tipY, color);
    const px = -uy, py = ux;
    drawLinePixels(add, tipX, tipY,
      tipX - ux * 13 + px * 9, tipY - uy * 13 + py * 9, color);
    drawLinePixels(add, tipX, tipY,
      tipX - ux * 13 - px * 9, tipY - uy * 13 - py * 9, color);
  },

  drawChart(reading, now) {
    this.clearWidgets("chartWidgets");
    const points = chartCoordinates(reading, now, GRAPH_W, GRAPH_H, this.chartMinutes);
    if (points.length === 0) {
      this.chartWidgets.push(addText(125, 346, 216, 34, 23, MUTED, "NO HISTORY"));
      return;
    }
    const color = readingColor(reading);
    for (const point of linePixels(points)) {
      this.chartWidgets.push(hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: GRAPH_X + point.x, y: GRAPH_Y + point.y,
        w: 3, h: 3, color, show_level: hmUI.show_level.ONLY_NORMAL,
      }));
    }
    for (const point of points) {
      this.chartWidgets.push(hmUI.createWidget(hmUI.widget.CIRCLE, {
        center_x: GRAPH_X + point.x, center_y: GRAPH_Y + point.y,
        radius: 2, color, show_level: hmUI.show_level.ONLY_NORMAL,
      }));
    }
  },

  getGlucose() {
    const now = this.clock.getTime();
    let full = "", small = "";
    try {
      // Recreate the shared reader on every refresh to observe AppService
      // writes from the other Mini App process.
      const storage = new TypedStorage(APP_ID, SHARED_SCOPE);
      try {
        const range = storage.getInt(CHART_RANGE_KEY, 360);
        this.chartMinutes = range === 120 ? 120 : 360;
      } catch (_) {
        // A chart preference error must not suppress the glucose reading.
      }
      try { small = storage.getString(SHARED_READING_KEY, ""); }
      catch (_) { console.log("[LibreFace] READING_READ_FAILED"); }
      try { full = storage.getString(SHARED_KEY, ""); }
      catch (_) { console.log("[LibreFace] HISTORY_READ_FAILED"); }
    } catch (_) {
      console.log("[LibreFace] SHARE_UNAVAILABLE");
    }
    const raw = selectReliableGlucoseRaw([full, small, this.lastRaw], now);
    if (raw && raw !== this.lastRaw) {
      this.lastRaw = raw;
      try { this.cacheStorage?.setItem(LOCAL_CACHE_KEY, raw); }
      catch (_) { console.log("[LibreFace] CACHE_WRITE_FAILED"); }
    }
    return parseGlucoseSnapshot(this.lastRaw, now);
  },

  isScreenAwake() {
    try { return this.screen ? this.screen.getStatus() === 1 : getScene() !== SCENE_AOD; }
    catch (_) { return getScene() !== SCENE_AOD; }
  },

  readWearStatus() {
    try { return this.wear ? this.wear.getStatus() : null; }
    catch (_) { return null; }
  },

  sampleWearStatus() {
    const status = this.readWearStatus();
    const now = this.clock.getTime();
    if (status !== 1) {
      this.wearingSince = 0;
      this.currentBpm = null;
      this.bpmMeasuredAt = 0;
      this.heartEventCount = 0;
    } else if (this.lastWearStatus !== 1 || this.wearingSince === 0) {
      this.wearingSince = now;
      this.currentBpm = null;
      this.bpmMeasuredAt = 0;
      this.heartEventCount = 0;
    }
    this.lastWearStatus = status;
    return status;
  },

  isWearing() {
    return this.readWearStatus() === 1;
  },

  readAodMode() {
    try {
      const mode = getSettings()?.standby?.style;
      return mode === 0 ? "SYSTEM" : mode === 1 ? "FACE" : "UNKNOWN";
    } catch (_) {
      return "UNKNOWN";
    }
  },

  stopHeartMonitoring() {
    if (!this.heartListening || !this.heart || !this.heartCallback) return;
    try { this.heart.offCurrentChange(this.heartCallback); } catch (_) {}
    this.heartListening = false;
  },

  syncHeartMonitoring() {
    const status = this.sampleWearStatus();
    if (status !== 1 || !this.isScreenAwake()) {
      this.currentBpm = null;
      this.bpmMeasuredAt = 0;
      this.heartEventCount = 0;
      this.stopHeartMonitoring();
      this.updateHeartText();
      return;
    }
    if (!this.heart || this.heartListening) return;
    if (!this.heartCallback) {
      this.heartCallback = () => {
        if (this.destroyed || this.sampleWearStatus() !== 1 || !this.isScreenAwake()) {
          this.currentBpm = null;
          this.updateHeartText();
          return;
        }
        try {
          const bpm = Number(this.heart.getCurrent());
          if (Number.isFinite(bpm) && bpm >= 35 && bpm <= 230) {
            this.currentBpm = Math.round(bpm);
            this.bpmMeasuredAt = this.clock.getTime();
            this.heartEventCount += 1;
            this.updateHeartText();
          }
        } catch (_) {}
      };
    }
    try {
      this.heart.onCurrentChange(this.heartCallback);
      this.heartListening = true;
    } catch (_) {
      this.heartListening = false;
    }
  },

  startForegroundRefresh() {
    if (this.pollTimer !== null || !this.isScreenAwake()) return;
    try {
      this.pollTimer = timer.createTimer(
        FOREGROUND_REFRESH_MS, FOREGROUND_REFRESH_MS,
        () => {
          if (this.destroyed || !this.isScreenAwake()) return;
          this.refresh();
        }, {}
      );
    } catch (_) {
      this.pollTimer = null;
    }
  },

  stopForegroundRefresh() {
    if (this.pollTimer === null) return;
    try { timer.stopTimer(this.pollTimer); } catch (_) {}
    this.pollTimer = null;
  },

  updateHeartText() {
    if (!this.heartText) return;
    const now = this.clock.getTime();
    const status = this.sampleWearStatus();
    const fresh = isHeartRateDisplayable({
      wearStatus: status,
      wearingSince: this.wearingSince,
      bpm: this.currentBpm,
      measuredAt: this.bpmMeasuredAt,
      eventCount: this.heartEventCount,
      now,
    });
    this.heartText.setProperty(hmUI.prop.TEXT,
      fresh ? String(this.currentBpm) + " BPM" : "-- BPM");
    if (this.wearDebugText) {
      this.wearDebugText.setProperty(hmUI.prop.TEXT,
        "WRIST " + (status === null ? "?" : status));
    }
  },

  refreshAod(reading) {
    this.aodTimeText.setProperty(hmUI.prop.TEXT, formatTime(this.clock));
    this.aodDateText.setProperty(hmUI.prop.TEXT, formatDate(this.clock));
    this.aodGlucoseText.setProperty(hmUI.prop.TEXT,
      reading ? String(reading.value) : "--");
    this.aodGlucoseText.setProperty(hmUI.prop.COLOR, readingColor(reading));
    this.aodAgeText.setProperty(hmUI.prop.TEXT, !reading ? "NO CGM DATA" :
      reading.ageMinutes > STALE_AFTER_MINUTES ?
        "STALE " + reading.ageMinutes + "m · mg/dL" :
        reading.ageMinutes + "m · mg/dL");
  },

  refresh() {
    const now = this.clock.getTime();
    const reading = this.getGlucose();
    // Update AOD widgets from the same shared glucose record, not a separate
    // launch-only scene. Explicitly re-read on every minute callback.
    this.refreshAod(reading);
    if (getScene() === SCENE_AOD) {
      hmUI.redraw();
      return;
    }
    this.timeText.setProperty(hmUI.prop.TEXT, formatTime(this.clock));
    this.dateText.setProperty(hmUI.prop.TEXT, formatDate(this.clock));
    const color = readingColor(reading);
    this.glucoseText.setProperty(hmUI.prop.TEXT, reading ? String(reading.value) : "--");
    this.glucoseText.setProperty(hmUI.prop.COLOR, color);
    this.ageText.setProperty(hmUI.prop.TEXT,
      !reading ? "NO CGM DATA" :
      reading.ageMinutes > STALE_AFTER_MINUTES ?
        "STALE " + reading.ageMinutes + "m" :
        reading.ageMinutes + "m · SHARE " +
          (reading.publishAgeMinutes === null ? "?" : reading.publishAgeMinutes + "m"));
    this.drawTrend(reading?.trend || 0, color);
    const aodMode = this.readAodMode();
    this.chartLabel.setProperty(hmUI.prop.TEXT,
      (this.chartMinutes === 120 ? "2H" : "6H") +
      " · AOD " + aodMode);
    this.drawChart(reading, now);

    this.updateHeartText();
    let batteryLevel = -1;
    try { batteryLevel = this.battery?.getCurrent() ?? -1; } catch (_) { /* No reading */ }
    this.batteryText.setProperty(hmUI.prop.TEXT,
      batteryLevel >= 0 ? String(Math.round(batteryLevel)) + "%" : "--%");
    hmUI.redraw();
  },

  onDestroy() {
    this.destroyed = true;
    this.stopForegroundRefresh();
    this.stopHeartMonitoring();
    if (this.screen && this.screenCallback) {
      try { this.screen.offChange(this.screenCallback); } catch (_) {}
      this.screenCallback = null;
    }
    if (this.wear && this.wearCallback) {
      try { this.wear.offChange(this.wearCallback); } catch (_) {}
      this.wearCallback = null;
    }
    this.heartCallback = null;
    this.clearWidgets("chartWidgets");
    this.clearWidgets("trendWidgets");
  },
});
