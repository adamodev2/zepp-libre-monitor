const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "node_modules/@zeppos/zeus-cli/private-modules/zeppos-app-utils");
const link = path.join(root, "node_modules/zeppos-app-utils");

if (!fs.existsSync(target)) {
  throw new Error("Zeus CLI utilities are missing. Run npm install first.");
}
if (!fs.existsSync(link)) {
  fs.symlinkSync(path.relative(path.dirname(link), target), link, "dir");
  console.log("Linked Zepp OS CLI utilities");
}
execFileSync(process.execPath, [path.join(__dirname, "generate-icon.cjs")], {
  cwd: root,
  stdio: "inherit",
});
console.log("Zepp OS preview prerequisites are ready.");
