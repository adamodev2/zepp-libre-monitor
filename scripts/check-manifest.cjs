const fs = require("node:fs");
const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
if (app.configVersion !== "v3") throw new Error("Expected configVersion v3");
if (app.app.appType !== "app") throw new Error("Expected Zepp OS app");
if (!app.targets?.common?.module?.["app-side"]?.path) throw new Error("Side service is missing");
if (!app.targets?.common?.module?.page?.pages?.length) throw new Error("Device page is missing");
console.log("Manifest structure verified");
