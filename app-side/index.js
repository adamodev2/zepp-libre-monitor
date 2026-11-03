import { BaseSideService } from "@zeppos/zml/base-side";

AppSideService(BaseSideService({
  onInit() {
    console.log("[LibreMonitorDiag] onInit");
  },
  onRequest(req, res) {
    console.log("[LibreMonitorDiag] request", req.method);
    if (req.method === "PING") {
      res(null, { ok: true, message: "PHONE SERVICE OK" });
      return;
    }
    res(null, { error: "Unsupported diagnostic request" });
  },
  onRun() {
    console.log("[LibreMonitorDiag] onRun");
  },
  onDestroy() {
    console.log("[LibreMonitorDiag] onDestroy");
  },
}));
