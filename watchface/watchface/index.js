import * as hmUI from "@zos/ui";
import { Time, Battery, HeartRate } from "@zos/sensor";
import { TypedStorage } from "@zos/share-storage";
import {
  CHART_MINUTES, STALE_AFTER_MINUTES, parseGlucoseSnapshot,
  readingColor, chartCoordinates, linePixels,
} from "../lib/model";

const APP_ID = 1092841;
const SHARED_SCOPE = "libre-glucose-face-v1";
const SHARED_KEY = "snapshot";
const WHITE = 0xffffff;
const MUTED = 0xa7b3be;
const FAINT = 0x536574;
const GRAPH_X = 82;
const GRAPH_Y = 301;
const GRAPH_W = 302;
const GRAPH_H = 70;
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
  },

  build() {
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0, w: 466, h: 466, color: 0x050b12,
    });

    this.timeText = addText(55, 28, 356, 97, 88, WHITE, "--:--");
    this.dateText = addText(90, 119, 286, 33, 25, MUTED, "--.--.----");

    this.glucoseText = addText(85, 161, 278, 99, 86, WHITE, "--");
    this.unitsText = addText(120, 242, 226, 30, 23, MUTED, "mg/dL");
    this.ageText = addText(118, 265, 230, 28, 22, MUTED, "NO CGM DATA");

    addText(90, 288, 286, 25, 19, FAINT, "GLUCOSE · 2H");
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: GRAPH_X, y: GRAPH_Y + GRAPH_H - 1, w: GRAPH_W, h: 1, color: FAINT,
    });

    this.heartText = addText(72, 387, 155, 39, 28, WHITE, "-- BPM");
    this.batteryText = addText(235, 387, 158, 39, 28, WHITE, "--%");
    addText(87, 423, 295, 25, 19, FAINT, "LIBRE MONITOR");

    this.refresh();
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
    const tipX = 369 + ux * 18, tipY = 205 + uy * 18;
    const tailX = 369 - ux * 18, tailY = 205 - uy * 18;
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
    const points = chartCoordinates(reading, now, GRAPH_W, GRAPH_H);
    if (points.length === 0) {
      this.chartWidgets.push(addText(125, 315, 216, 34, 20, FAINT, "NO HISTORY"));
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
      const raw = storage.getString(SHARED_KEY, "");
      if (raw) this.lastRaw = raw;
    } catch (_) {
      // If cross-app storage is unavailable keep the last known record,
      // but continue updating its age. Never fabricate an up-to-date value.
    }
    return parseGlucoseSnapshot(this.lastRaw, this.clock.getTime());
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
    this.drawChart(reading, now);

    let bpm = 0, batteryLevel = -1;
    try { bpm = this.heart?.getLast() || 0; } catch (_) { /* No reading */ }
    try { batteryLevel = this.battery?.getCurrent() ?? -1; } catch (_) { /* No reading */ }
    this.heartText.setProperty(hmUI.prop.TEXT, bpm > 0 ? String(bpm) + " BPM" : "-- BPM");
    this.batteryText.setProperty(hmUI.prop.TEXT,
      batteryLevel >= 0 ? String(Math.round(batteryLevel)) + "%" : "--%");
    hmUI.redraw();
  },

  onDestroy() {
    this.destroyed = true;
    this.clearWidgets("chartWidgets");
    this.clearWidgets("trendWidgets");
  },
});
