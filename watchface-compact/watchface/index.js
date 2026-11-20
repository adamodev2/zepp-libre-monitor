import * as hmUI from "@zos/ui";
import { Time, Battery, HeartRate, Wear, Screen } from "@zos/sensor";
import * as timer from "@zos/timer";
import { TypedStorage } from "@zos/share-storage";
import { getScene, SCENE_AOD } from "@zos/app";
import { isHeartRateDisplayable } from "../lib/heart-confidence";
import {
  parseGlucoseSnapshot, readingColor, chartCoordinates, linePixels,
} from "../lib/model";
import {
  FACE_SIZE, CHART_MINUTES, PANEL, GRAPH, HEART_PILL, BATTERY_PILL,
  GLUCOSE_TEXT, TREND_ARROW,
  formatFaceTime, formatFaceDate, glucoseAgeLabel, isChartGap,
} from "../lib/design";

const PRODUCER_APP_ID = 1092841;
const SHARED_SCOPE = "libre-glucose-face-v1";
const SHARED_KEY = "snapshot";
const REFRESH_INTERVAL_MS = 30_000;
const WHITE = 0xffffff;
const MUTED = 0x9ba5b3;
const PANEL_COLOR = 0x151920;
const GRAPH_FILL = 0x173b2c;
const PILL_COLOR = 0x171b23;
const HEART_COLOR = 0xff5478;
const TREND = {
  1: [0, 1], 2: [1, 1], 3: [1, 0], 4: [1, -1], 5: [0, -1],
};

function rectangle(x, y, w, h, color, radius = 0, level = hmUI.show_level.ONLY_NORMAL) {
  return hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x, y, w, h, color, radius, show_level: level,
  });
}

function text(x, y, w, h, size, color, value, options = {}) {
  return hmUI.createWidget(hmUI.widget.TEXT, {
    x, y, w, h, text_size: size, color, text: value,
    align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.NONE,
    show_level: hmUI.show_level.ONLY_NORMAL,
    ...options,
  });
}

function linePixel(widgets, x, y, color, size = 3) {
  widgets.push(rectangle(Math.round(x), Math.round(y), size, size, color));
}

function segment(widgets, x1, y1, x2, y2, color, step = 3, size = 3) {
  const distance = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  const divisions = Math.max(1, Math.ceil(distance / step));
  for (let i = 0; i <= divisions; i++) {
    linePixel(widgets, x1 + (x2 - x1) * i / divisions,
      y1 + (y2 - y1) * i / divisions, color, size);
  }
}

function heartIcon(x, y) {
  // Small native pixel-art heart; avoids unsupported Unicode glyphs.
  const bands = [
    [[2, 3], [7, 3]], [[1, 5], [6, 5]], [[0, 11]], [[0, 11]],
    [[1, 9]], [[2, 7]], [[3, 5]], [[4, 3]], [[5, 1]],
  ];
  bands.forEach((row, rowIndex) => {
    row.forEach(([start, count]) => rectangle(
      x + start * 2, y + rowIndex * 2, count * 2, 2, HEART_COLOR
    ));
  });
}

function batteryOutline() {
  rectangle(246, 390, 26, 18, WHITE, 5);
  rectangle(248, 392, 22, 14, PILL_COLOR, 3);
  rectangle(273, 395, 3, 8, WHITE, 1);
}

WatchFace({
  onInit() {
    this.clock = new Time();
    this.battery = null;
    this.heart = null;
    this.wear = null;
    this.screen = null;
    try { this.battery = new Battery(); } catch (_) {}
    try { this.heart = new HeartRate(); } catch (_) {}
    try { this.wear = new Wear(); } catch (_) {}
    try { this.screen = new Screen(); } catch (_) {}
    this.destroyed = false;
    this.lastRaw = "";
    this.chartWidgets = [];
    this.trendWidgets = [];
    this.chartSignature = "";
    this.pollTimer = null;
    this.screenCallback = null;
    this.wearCallback = null;
    this.heartCallback = null;
    this.heartListening = false;
    this.wearingSince = 0;
    this.lastWearStatus = null;
    this.currentBpm = null;
    this.heartEventCount = 0;
    this.bpmMeasuredAt = 0;
    this.batteryFill = null;
    this.batteryLevel = -1;
  },

  build() {
    rectangle(0, 0, FACE_SIZE, FACE_SIZE, 0x000000);
    rectangle(0, 0, FACE_SIZE, FACE_SIZE, 0x000000, 0, hmUI.show_level.ONAL_AOD);
    rectangle(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL_COLOR, 35);
    rectangle(HEART_PILL.x, HEART_PILL.y, HEART_PILL.w, HEART_PILL.h, PILL_COLOR, 23);
    rectangle(BATTERY_PILL.x, BATTERY_PILL.y, BATTERY_PILL.w, BATTERY_PILL.h, PILL_COLOR, 23);

    this.dateText = text(75, 48, 316, 34, 28, MUTED, "--- -- ---");
    this.timeText = text(30, 76, 406, 132, 127, WHITE, "--:--");
    this.glucoseText = text(
      GLUCOSE_TEXT.x, GLUCOSE_TEXT.y, GLUCOSE_TEXT.w,
      GLUCOSE_TEXT.h, GLUCOSE_TEXT.size, WHITE, "--", {
      align_h: hmUI.align.CENTER_H,
    });
    // A subtle full-width axis makes missing history visible without drawing fake values.
    rectangle(GRAPH.x, GRAPH.y + GRAPH.h - 1, GRAPH.w, 1, 0x29333b);
    this.rangeText = text(GRAPH.x, 312, 47, 26, 22, MUTED, "2h");
    this.ageText = text(331, 312, 96, 26, 22, WHITE, "NO DATA", {
      align_h: hmUI.align.RIGHT,
    });
    heartIcon(123, 389);
    this.heartText = text(148, 384, 54, 29, 32, WHITE, "--");
    batteryOutline();
    this.batteryText = text(282, 384, 82, 30, 31, WHITE, "--%");

    // AOD intentionally avoids the large bright panel and chart.
    // Whether Zepp uses it depends on the device's system AOD style.
    const aod = hmUI.show_level.ONAL_AOD;
    this.aodTimeText = text(92, 145, 282, 85, 84, WHITE, "--:--", { show_level: aod });
    this.aodGlucoseText = text(127, 254, 212, 74, 72, WHITE, "--", { show_level: aod });
    this.aodAgeText = text(125, 325, 216, 30, 21, MUTED, "NO CGM DATA", {
      show_level: aod,
    });

    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        if (this.destroyed) return;
        this.refresh();
        this.syncHeart();
        this.startRefresh();
      },
      pause_call: () => {
        this.stopRefresh();
        this.stopHeart();
      },
    });

    this.refresh();
    if (this.wear) {
      try {
        this.wearCallback = () => {
          this.syncHeart();
          this.renderHeart();
        };
        this.wear.onChange(this.wearCallback);
      } catch (_) { this.wearCallback = null; }
    }
    if (this.screen) {
      try {
        this.screenCallback = (state) => {
          if (this.destroyed) return;
          if (state === 1) {
            this.refresh();
            this.syncHeart();
            this.startRefresh();
          } else {
            this.stopRefresh();
            this.stopHeart();
            this.renderHeart();
          }
        };
        this.screen.onChange(this.screenCallback);
      } catch (_) { this.screenCallback = null; }
    }
    this.clock.onPerMinute(() => { if (!this.destroyed) this.refresh(); });
    this.syncHeart();
    this.startRefresh();
  },

  clearWidgets(name) {
    for (const widget of this[name]) hmUI.deleteWidget(widget);
    this[name] = [];
  },

  getGlucose() {
    try {
      // Only the Mini App (1092841) owns the network connection and publisher.
      const raw = new TypedStorage(PRODUCER_APP_ID, SHARED_SCOPE)
        .getString(SHARED_KEY, "");
      if (raw) {
        const now = this.clock.getTime();
        const candidate = parseGlucoseSnapshot(raw, now);
        const previous = parseGlucoseSnapshot(this.lastRaw, now);
        if (candidate && (!previous || candidate.timestamp >= previous.timestamp)) {
          this.lastRaw = raw;
        }
      }
    } catch (_) {
      // Keep the last real reading, never synthesize a fresh one.
    }
    return parseGlucoseSnapshot(this.lastRaw, this.clock.getTime());
  },

  drawTrend(trend, color) {
    this.clearWidgets("trendWidgets");
    const vector = TREND[trend];
    if (!vector) return;
    const [dx, dy] = vector;
    const length = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / length, uy = dy / length;
    // Center on the glucose glyph, not on the entire panel.
    const { centerX, centerY, halfLength: half, strokeSize } = TREND_ARROW;
    const tailX = centerX - ux * half;
    const tailY = centerY - uy * half;
    const tipX = centerX + ux * half;
    const tipY = centerY + uy * half;
    segment(this.trendWidgets, tailX, tailY, tipX, tipY, color, 2, strokeSize);
    const px = -uy, py = ux;
    segment(this.trendWidgets, tipX, tipY,
      tipX - ux * TREND_ARROW.headLength + px * TREND_ARROW.headWidth,
      tipY - uy * TREND_ARROW.headLength + py * TREND_ARROW.headWidth,
      color, 2, strokeSize);
    segment(this.trendWidgets, tipX, tipY,
      tipX - ux * TREND_ARROW.headLength - px * TREND_ARROW.headWidth,
      tipY - uy * TREND_ARROW.headLength - py * TREND_ARROW.headWidth,
      color, 2, strokeSize);
  },

  drawChart(reading, now, color) {
    const signature = Math.floor(now / 60_000) + ":" + this.lastRaw;
    if (signature === this.chartSignature) return;
    this.chartSignature = signature;
    this.clearWidgets("chartWidgets");
    const points = chartCoordinates(reading, now, GRAPH.w, GRAPH.h, CHART_MINUTES);
    if (points.length === 0) return;

    // Fill and trace only observed, contiguous history. The 2h axis always
    // stays fixed, so sparse history may use only its right-hand portion.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (isChartGap(a, b)) continue;
      const width = Math.max(1, b.x - a.x);
      for (let dx = 0; dx <= width; dx += 5) {
        const px = a.x + dx;
        const y = Math.round(a.y + (b.y - a.y) * dx / width);
        this.chartWidgets.push(rectangle(
          GRAPH.x + px, GRAPH.y + y, 5, Math.max(1, GRAPH.h - 1 - y),
          GRAPH_FILL
        ));
      }
    }
    for (const p of linePixels(points, 130)) {
      linePixel(this.chartWidgets, GRAPH.x + p.x, GRAPH.y + p.y, color, 4);
    }
    const latest = points[points.length - 1];
    this.chartWidgets.push(hmUI.createWidget(hmUI.widget.CIRCLE, {
      center_x: GRAPH.x + latest.x, center_y: GRAPH.y + latest.y,
      radius: 5, color, show_level: hmUI.show_level.ONLY_NORMAL,
    }));
  },

  isAwake() {
    try { return this.screen ? this.screen.getStatus() === 1 : getScene() !== SCENE_AOD; }
    catch (_) { return getScene() !== SCENE_AOD; }
  },

  wearStatus() {
    try { return this.wear ? this.wear.getStatus() : null; }
    catch (_) { return null; }
  },

  sampleWear() {
    const status = this.wearStatus();
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

  stopHeart() {
    if (this.heartListening && this.heart && this.heartCallback) {
      try { this.heart.offCurrentChange(this.heartCallback); } catch (_) {}
    }
    this.heartListening = false;
  },

  syncHeart() {
    if (this.sampleWear() !== 1 || !this.isAwake()) {
      this.stopHeart();
      this.renderHeart();
      return;
    }
    if (!this.heart || this.heartListening) return;
    if (!this.heartCallback) {
      this.heartCallback = () => {
        if (this.destroyed || this.sampleWear() !== 1 || !this.isAwake()) {
          this.renderHeart();
          return;
        }
        try {
          const value = Number(this.heart.getCurrent());
          if (Number.isFinite(value) && value >= 35 && value <= 230) {
            this.currentBpm = Math.round(value);
            this.bpmMeasuredAt = this.clock.getTime();
            this.heartEventCount++;
            this.renderHeart();
          }
        } catch (_) {}
      };
    }
    try {
      this.heart.onCurrentChange(this.heartCallback);
      this.heartListening = true;
    } catch (_) { this.heartListening = false; }
  },

  renderHeart() {
    if (!this.heartText) return;
    const status = this.sampleWear();
    const valid = isHeartRateDisplayable({
      wearStatus: status, wearingSince: this.wearingSince,
      bpm: this.currentBpm, measuredAt: this.bpmMeasuredAt,
      eventCount: this.heartEventCount, now: this.clock.getTime(),
    });
    this.heartText.setProperty(hmUI.prop.TEXT, valid ? String(this.currentBpm) : "--");
  },

  startRefresh() {
    if (this.pollTimer !== null || !this.isAwake()) return;
    try {
      this.pollTimer = timer.createTimer(
        REFRESH_INTERVAL_MS, REFRESH_INTERVAL_MS,
        () => { if (!this.destroyed && this.isAwake()) this.refresh(); }, {}
      );
    } catch (_) { this.pollTimer = null; }
  },

  stopRefresh() {
    if (this.pollTimer === null) return;
    try { timer.stopTimer(this.pollTimer); } catch (_) {}
    this.pollTimer = null;
  },

  renderBattery() {
    let level = -1;
    try { level = this.battery?.getCurrent() ?? -1; } catch (_) {}
    const valid = Number.isFinite(level) && level >= 0 && level <= 100;
    this.batteryText.setProperty(hmUI.prop.TEXT, valid ? Math.round(level) + "%" : "--%");
    const quantized = valid ? Math.round(level / 10) * 10 : -1;
    if (quantized === this.batteryLevel) return;
    this.batteryLevel = quantized;
    if (this.batteryFill) hmUI.deleteWidget(this.batteryFill);
    this.batteryFill = valid ? rectangle(
      250, 394, Math.max(1, Math.round(18 * quantized / 100)),
      10, WHITE, 2
    ) : null;
  },

  refresh() {
    const now = this.clock.getTime();
    const reading = this.getGlucose();
    const color = readingColor(reading);
    this.aodTimeText.setProperty(hmUI.prop.TEXT, formatFaceTime(now));
    this.aodGlucoseText.setProperty(hmUI.prop.TEXT, reading ? String(reading.value) : "--");
    this.aodGlucoseText.setProperty(hmUI.prop.COLOR, color);
    this.aodAgeText.setProperty(hmUI.prop.TEXT, glucoseAgeLabel(reading));

    if (getScene() === SCENE_AOD) {
      hmUI.redraw();
      return;
    }
    this.dateText.setProperty(hmUI.prop.TEXT, formatFaceDate(now));
    this.timeText.setProperty(hmUI.prop.TEXT, formatFaceTime(now));
    this.glucoseText.setProperty(hmUI.prop.TEXT, reading ? String(reading.value) : "--");
    this.glucoseText.setProperty(hmUI.prop.COLOR, color);
    this.ageText.setProperty(hmUI.prop.TEXT, glucoseAgeLabel(reading));
    this.drawTrend(reading?.trend || 0, color);
    this.drawChart(reading, now, color);
    this.renderHeart();
    this.renderBattery();
    hmUI.redraw();
  },

  onDestroy() {
    this.destroyed = true;
    this.stopRefresh();
    this.stopHeart();
    if (this.screen && this.screenCallback) {
      try { this.screen.offChange(this.screenCallback); } catch (_) {}
    }
    if (this.wear && this.wearCallback) {
      try { this.wear.offChange(this.wearCallback); } catch (_) {}
    }
    this.clearWidgets("chartWidgets");
    this.clearWidgets("trendWidgets");
    if (this.batteryFill) hmUI.deleteWidget(this.batteryFill);
  },
});
