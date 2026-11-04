const fs = require("node:fs");
const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
if (app.configVersion !== "v3") throw new Error("Expected configVersion v3");
if (app.app.appType !== "app") throw new Error("Expected Zepp OS app");
if (!app.targets?.common?.module?.["app-side"]?.path) throw new Error("Side service is missing");
if (!app.targets?.common?.module?.page?.pages?.length) throw new Error("Device page is missing");
const targets = app.targets?.common?.platforms || [];
if (targets[0]?.st !== "r" || targets[0]?.dw !== 466) {
  throw new Error("Round 466px Active 2 must be the first/default target");
}
if (!targets.some((target) => target.st === "s" && target.dw === 390)) {
  throw new Error("Missing square 390px Active 2 target");
}
console.log("Manifest supports round (default) and square Active 2 targets");
