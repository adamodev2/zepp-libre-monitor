import { BaseSideService } from "@zeppos/zml/base-side";
import { addDiagnostic } from "./diagnostics";

AppSideService(BaseSideService({
  onInit() {
    console.log("[LibreSettingsTest] onInit");
    addDiagnostic("SIDE_STARTED");
  },
  onRequest(req, res) {
    if (req.method !== "PING") {
      res(null, { error: "Unsupported diagnostic request" });
      return;
    }
    addDiagnostic("WATCH_REQUEST");
    try {
      const email = settings.settingsStorage.getItem("libre_email");
      const password = settings.settingsStorage.getItem("libre_password");
      if (!email || !password) addDiagnostic("CREDENTIALS_MISSING");
      res(null, { ok: true, message: "PHONE SETTINGS OK", credentialsConfigured: Boolean(email && password) });
    } catch (_) {
      res(null, { ok: false, message: "PHONE SETTINGS ERROR" });
    }
  },
  onRun() {},
  onDestroy() {},
}));
