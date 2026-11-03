const fs = require("node:fs");
const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
if (app.configVersion !== "v3") throw new Error("Expected configVersion v3");
if (app.app.appType !== "app") throw new Error("Expected Zepp OS app");
if (!app.targets?.common?.module?.["app-side"]?.path) throw new Error("Side service is missing");
if (!app.targets?.common?.module?.page?.pages?.length) throw new Error("Device page is missing");
const targets = app.targets?.common?.platforms || [];
if (!targets.some((target) => target.st === "r" && target.dw === 466)) {
  throw new Error("Amazfit Active 2 requires a round 466px target");
}
console.log("Manifest and Active 2 round-device target verified");
