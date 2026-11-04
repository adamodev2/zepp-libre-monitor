import { BaseSideService } from "@zeppos/zml/base-side";
import { getGlucose } from "./librelinkup";
import { addDiagnostic } from "./diagnostics";
import { markBackgroundSync } from "./history-store";

function publicError(error) {
  const message = String(error?.message || "");
  if (/^(LOGIN|CONNECTIONS): (network request failed|invalid JSON response|HTTP [0-9]+)$/.test(message)) return message;
  if (message === "Configure LibreLinkUp account in Zepp settings") return message;
  if (message === "Accept updated Abbott terms in LibreLinkUp") return message;
  if (message === "LibreLinkUp sign-in failed") return message;
  if (message === "No shared LibreLinkUp glucose readings found") return message;
  return "LibreLinkUp request failed; see Diagnostics";
}

AppSideService(BaseSideService({
  onInit() {
    console.log("[LibreMonitor] SIDE_SERVICE_INITIALIZED");
    addDiagnostic("SIDE_STARTED");
  },
  async onRequest(req, res) {
    if (req.method === "PING") {
      res(null, { ok: true, service: "libre-monitor" });
      return;
    }
    const isBackgroundSync = req.method === "BACKGROUND_SYNC";
    if (req.method !== "GET_GLUCOSE" && !isBackgroundSync) {
      res(null, { error: "Unsupported request" });
      return;
    }
    addDiagnostic(isBackgroundSync ? "BACKGROUND_REQUEST" : "WATCH_REQUEST");
    try {
      const email = settings.settingsStorage.getItem("libre_email");
      const password = settings.settingsStorage.getItem("libre_password");
      if (!email || !password) addDiagnostic("CREDENTIALS_MISSING");
      const reading = await getGlucose(email, password, addDiagnostic, settings.settingsStorage);
      if (isBackgroundSync) {
        if (Number.isFinite(reading.ageMs) && reading.ageMs >= -60_000 && reading.ageMs <= 15 * 60_000) {
          markBackgroundSync(settings.settingsStorage);
          addDiagnostic("BACKGROUND_SUCCESS");
          res(null, { ok: true });
        } else {
          addDiagnostic("BACKGROUND_STALE");
          res(null, { ok: false });
        }
      } else {
        addDiagnostic("REQUEST_FINISHED", "OK");
        res(null, { reading });
      }
    } catch (error) {
      addDiagnostic(isBackgroundSync ? "BACKGROUND_FAILURE" : "REQUEST_FINISHED", "ERROR");
      // Never expose untrusted error objects, passwords, tokens, or response bodies.
      res(null, { error: publicError(error) });
    }
  },
  onRun() {},
  onDestroy() {},
}));
