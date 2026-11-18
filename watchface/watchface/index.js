import * as hmUI from "@zos/ui";
import { Time, Battery, HeartRate } from "@zos/sensor";
import { TypedStorage } from "@zos/share-storage";
import { getScene, SCENE_AOD } from "@zos/app";
import {
  STALE_AFTER_MINUTES, parseGlucoseSnapshot,
  readingColor, chartCoordinates, linePixels,
} from "../lib/model";

const APP_ID = 1092841;
const SHARED_SCOPE = "libre-glucose-face-v1";
const SHARED_KEY = "snapshot";
const CHART_RANGE_KEY = "chart_range_minutes";
const HR_MAX_AGE_MS = 2 * 60_000;
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

function addText(x, y, w, h, size, color, text) {
  return hmUI.createWidget(hmUI.widget.TEXT, {
    x, y, w, h, color, text_size: size,
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
    draw(hmUI.widget.FILL_RECT, { x, y, w: 4, h: 4, color });
  }
}

WatchFace({
  onInit() {
    this.clock = new Time();
    this.battery = null;
    this.heart = null;
    try { this.battery = new Battery(); } catch (_) { /* Not available */ }
    try { this.heart = new HeartRate(); } catch (_) { /* Permission needed */ }
    this.chartWidgets = [];
    this.trendWidgets = [];
    this.lastRaw = "";
    this.destroyed = false;
    this.heartCallback = null;
    this.currentBpm = null;
    this.bpmMeasuredAt = 0;
    this.chartMinutes = 360;
  },

  build() {
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0, w: 466, h: 466, color: 0x050b12,
    });
    if (getScene() === SCENE_AOD) {
      // Dedicated low-power face: preserve clock and glucose on screen-off.
      // There is no HR sensor polling or full chart in AOD mode.
      this.aodOnly = true;
      this.timeText = addText(43, 102, 380, 122, 109, WHITE, "--:--");
      this.dateText = addText(91, 227, 284, 37, 30, MUTED, "--.--.----");
      this.glucoseText = addText(108, 273, 250, 77, 69, WHITE, "--");
      this.ageText = addText(83, 350, 300, 34, 25, MUTED, "NO CGM DATA");
      this.refreshAod();
      this.clock.onPerMinute(() => {
        if (!this.destroyed) this.refreshAod();
      });
      return;
    }

    // Dominant watch time; glucose is the secondary focal point.
    this.timeText = addText(39, 49, 388, 123, 114, WHITE, "--:--");
    this.dateText = addText(90, 170, 286, 33, 30, MUTED, "--.--.----");

    this.glucoseText = addText(111, 204, 235, 75, 72, WHITE, "--");
    this.unitsText = addText(134, 266, 198, 27, 26, MUTED, "mg/dL");
    this.ageText = addText(108, 292, 250, 29, 25, MUTED, "NO CGM DATA");

    this.chartLabel = addText(102, 318, 262, 25, 23, MUTED, "GLUCOSE · 6H");
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: GRAPH_X, y: GRAPH_Y + GRAPH_H - 1, w: GRAPH_W, h: 1, color: FAINT,
    });

    this.heartText = addText(84, 400, 148, 37, 30, WHITE, "-- BPM");
    this.batteryText = addText(235, 400, 147, 37, 30, WHITE, "--%");

    this.refresh();
    // getLast() can be an old value, so only report a fresh sensor callback.
    if (this.heart) {
      try {
        this.heartCallback = () => {
          if (this.destroyed || this.aodOnly) return;
          const bpm = Number(this.heart.getCurrent());
          if (Number.isFinite(bpm) && bpm >= 35 && bpm <= 230) {
            this.currentBpm = Math.round(bpm);
            this.bpmMeasuredAt = this.clock.getTime();
            this.updateHeartText();
          }
        };
        this.heart.onCurrentChange(this.heartCallback);
      } catch (_) {
        this.heartCallback = null;
      }
    }
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
        w: 3, h: 3, color,
      }));
    }
    for (const point of points) {
      this.chartWidgets.push(hmUI.createWidget(hmUI.widget.CIRCLE, {
        center_x: GRAPH_X + point.x, center_y: GRAPH_Y + point.y,
        radius: 2, color,
      }));
    }
  },

  getGlucose() {
    try {
      // Re-create the reader so watchface sees AppService writes made later.
      const storage = new TypedStorage(APP_ID, SHARED_SCOPE);
      const range = storage.getInt(CHART_RANGE_KEY, 360);
      this.chartMinutes = range === 120 ? 120 : 360;
      const raw = storage.getString(SHARED_KEY, "");
      if (raw) this.lastRaw = raw;
    } catch (_) {
      // If cross-app storage is unavailable keep the last known record,
      // but continue updating its age. Never fabricate an up-to-date value.
    }
    return parseGlucoseSnapshot(this.lastRaw, this.clock.getTime());
  },

  updateHeartText() {
    if (!this.heartText) return;
    const age = this.clock.getTime() - this.bpmMeasuredAt;
    const fresh = this.currentBpm !== null && age >= 0 && age <= HR_MAX_AGE_MS;
    this.heartText.setProperty(hmUI.prop.TEXT,
      fresh ? String(this.currentBpm) + " BPM" : "-- BPM");
  },

  refreshAod() {
    this.timeText.setProperty(hmUI.prop.TEXT, formatTime(this.clock));
    this.dateText.setProperty(hmUI.prop.TEXT, formatDate(this.clock));
    const reading = this.getGlucose();
    this.glucoseText.setProperty(hmUI.prop.TEXT, reading ? String(reading.value) : "--");
    this.glucoseText.setProperty(hmUI.prop.COLOR, readingColor(reading));
    this.ageText.setProperty(hmUI.prop.TEXT, !reading ? "NO CGM DATA" :
      (reading.ageMinutes > STALE_AFTER_MINUTES ?
        "STALE " + reading.ageMinutes + "m · mg/dL" :
        reading.ageMinutes + "m · mg/dL"));
    hmUI.redraw();
  },

  refresh() {
    const now = this.clock.getTime();
    this.timeText.setProperty(hmUI.prop.TEXT, formatTime(this.clock));
    this.dateText.setProperty(hmUI.prop.TEXT, formatDate(this.clock));

    const reading = this.getGlucose();
    const color = readingColor(reading);
    this.glucoseText.setProperty(hmUI.prop.TEXT, reading ? String(reading.value) : "--");
    this.glucoseText.setProperty(hmUI.prop.COLOR, color);
    this.ageText.setProperty(hmUI.prop.TEXT,
      !reading ? "NO CGM DATA" :
      reading.ageMinutes > STALE_AFTER_MINUTES ?
        "STALE " + reading.ageMinutes + "m" : reading.ageMinutes + "m ago");
    this.drawTrend(reading?.trend || 0, color);
    this.chartLabel.setProperty(hmUI.prop.TEXT,
      "GLUCOSE · " + (this.chartMinutes === 120 ? "2H" : "6H"));
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
    if (this.heart && this.heartCallback) {
      try { this.heart.offCurrentChange(this.heartCallback); } catch (_) { /* No listener */ }
      this.heartCallback = null;
    }
    this.clearWidgets("chartWidgets");
    this.clearWidgets("trendWidgets");
  },
});
