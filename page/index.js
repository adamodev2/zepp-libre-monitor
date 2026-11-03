import * as hmUI from "@zos/ui";
import { BasePage } from "@zeppos/zml/base-page";
import { normalizeReading, trendArrow, glucoseBand } from "../shared/glucose";

const WIDTH = 390;
const WHITE = 0xffffff;
const MUTED = 0xa4b0bb;
const GREEN = 0x41d98a;
const RED = 0xff5d68;
const AMBER = 0xffc247;

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
  build() {
    this.heading = label(36, 32, 25, MUTED, "LIBRE MONITOR");
    this.value = label(105, 100, 84, WHITE, "--");
    this.units = label(205, 34, 23, MUTED, "mg/dL");
    this.trend = label(245, 45, 36, WHITE, "·");
    this.status = label(297, 28, 18, MUTED, "Connecting to LibreLinkUp...");
    this.refresh = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 110, y: 330, w: 170, h: 48,
      text: "Refresh", text_size: 20,
      color: WHITE, normal_color: 0x263442,
      press_color: 0x405163, radius: 20,
      click_func: () => this.loadReading(),
    });
    this.loadReading();
  },
  loadReading() {
    this.status.setProperty(hmUI.prop.TEXT, "Loading...");
    this.request({ method: "GET_GLUCOSE" })
      .then((response) => {
        if (response.error) throw new Error(response.error);
        const reading = normalizeReading(response.reading);
        const ageMinutes = reading.timestamp ? Math.floor((Date.now() - reading.timestamp) / 60000) : Infinity;
        if (ageMinutes < 0 || ageMinutes > 15) throw new Error("Reading unavailable or older than 15 min");
        const band = glucoseBand(reading.value);
        const color = band === "low" ? RED : band === "high" ? AMBER : GREEN;
        this.value.setProperty(hmUI.prop.TEXT, String(reading.value));
        this.value.setProperty(hmUI.prop.COLOR, color);
        this.trend.setProperty(hmUI.prop.TEXT, trendArrow(reading.trend));
        this.status.setProperty(hmUI.prop.TEXT, `LibreLinkUp · ${ageMinutes} min ago`);
      })
      .catch((error) => {
        this.value.setProperty(hmUI.prop.TEXT, "--");
        this.trend.setProperty(hmUI.prop.TEXT, "·");
        this.status.setProperty(hmUI.prop.TEXT, String(error.message || "No LibreLinkUp data").slice(0, 55));
      });
  },
}));
