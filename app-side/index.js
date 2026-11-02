import { BaseSideService } from "@zeppos/zml/base-side";

// Demo-only data source. Live LibreLinkUp authentication is intentionally not
// enabled until a private credential flow and API verification are implemented.
function demoReading() {
  return {
    value: 118,
    trend: 3,
    timestamp: Date.now(),
    source: "demo",
  };
}

AppSideService(BaseSideService({
  onInit() {},
  onRequest(req, res) {
    if (req.method === "GET_GLUCOSE") {
      res(null, { reading: demoReading(), demo: true });
      return;
    }
    res(null, { error: "Unsupported request" });
  },
  onRun() {},
  onDestroy() {},
}));
