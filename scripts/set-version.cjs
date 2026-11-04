const fs = require("node:fs");

const manifest = JSON.parse(fs.readFileSync("app.json", "utf8"));
const base = manifest.app.version.name.replace(/-dev(?:\.[\w.-]+)?$/, "");
if (!/^\d+\.\d+\.\d+$/.test(base)) throw new Error("Expected a semantic base version");
const isStable = process.env.GITHUB_REF === "refs/heads/main" && process.env.GITHUB_EVENT_NAME !== "pull_request";
const runNumber = Number(process.env.GITHUB_RUN_NUMBER || "0");
const suffix = isStable ? "" : `-dev.${runNumber || "local"}`;
manifest.app.version.name = base + suffix;
if (!isStable && runNumber > 0) {
  // Development build codes must be positive and distinct for each CI run.
  manifest.app.version.code = Math.max(manifest.app.version.code, runNumber + 1000);
}
fs.writeFileSync("app.json", JSON.stringify(manifest, null, 2) + "\n");
const label = manifest.app.version.name;
fs.appendFileSync(process.env.GITHUB_OUTPUT || "/dev/null", `version=${label}\nchannel=${isStable ? "stable" : "dev"}\n`);
console.log(`Build version: ${label} (code ${manifest.app.version.code})`);
