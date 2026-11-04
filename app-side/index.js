import { BaseSideService } from "@zeppos/zml/base-side";
import { getGlucose } from "./librelinkup";
import { addDiagnostic } from "./diagnostics";

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
    if (req.method !== "GET_GLUCOSE") {
      res(null, { error: "Unsupported request" });
      return;
    }
    addDiagnostic("WATCH_REQUEST");
    try {
      const email = settings.settingsStorage.getItem("libre_email");
      const password = settings.settingsStorage.getItem("libre_password");
      if (!email || !password) addDiagnostic("CREDENTIALS_MISSING");
      const reading = await getGlucose(email, password, addDiagnostic);
      addDiagnostic("REQUEST_FINISHED", "OK");
      res(null, { reading });
    } catch (error) {
      addDiagnostic("REQUEST_FINISHED", "ERROR");
      // Never expose untrusted error objects, passwords, tokens, or response bodies.
      res(null, { error: publicError(error) });
    }
  },
  onRun() {},
  onDestroy() {},
}));
