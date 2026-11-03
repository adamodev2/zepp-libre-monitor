import * as hmUI from "@zos/ui";
import { getDeviceInfo } from "@zos/device";
import { BasePage } from "@zeppos/zml/base-page";

const width = getDeviceInfo().width || 466;
const height = getDeviceInfo().height || 466;

Page(BasePage({
  build() {
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20, y: 90, w: width - 40, h: 50, color: 0xffffff,
      text: "SIDE SERVICE DIAGNOSTIC", text_size: 22,
      align_h: hmUI.align.CENTER_H,
    });
    this.status = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 25, y: 170, w: width - 50, h: 100, color: 0xffffff,
      text: "Waiting for phone...", text_size: 22,
      align_h: hmUI.align.CENTER_H,
    });
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: (width - 190) / 2, y: height - 110, w: 190, h: 55,
      text: "Test connection", color: 0xffffff, normal_color: 0x29475a,
      press_color: 0x376b86,
      click_func: () => this.testPhone(),
    });
    this.testPhone();
  },
  testPhone() {
    this.status.setProperty(hmUI.prop.TEXT, "Waiting for phone...");
    this.request({ method: "PING" })
      .then((result) => {
        this.status.setProperty(
          hmUI.prop.TEXT,
          result?.ok === true ? "PHONE SERVICE OK" : "INVALID PHONE RESPONSE"
        );
      })
      .catch(() => {
        this.status.setProperty(hmUI.prop.TEXT, "PHONE SERVICE ERROR");
      });
  },
}));
