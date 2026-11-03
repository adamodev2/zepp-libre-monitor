import { BaseSideService } from "@zeppos/zml/base-side";
import { getGlucose } from "./librelinkup";

AppSideService(BaseSideService({
  onInit() {},
  async onRequest(req, res) {
    if (req.method !== "GET_GLUCOSE") {
      res(null, { error: "Unsupported request" });
      return;
    }
    try {
      const email = settings.settingsStorage.getItem("libre_email");
      const password = settings.settingsStorage.getItem("libre_password");
      const reading = await getGlucose(email, password);
      res(null, { reading });
    } catch (error) {
      // Never log usernames, passwords, bearer tokens, or response bodies.
      res(null, { error: String(error.message || "LibreLinkUp request failed") });
    }
  },
  onRun() {},
  onDestroy() {},
}));
