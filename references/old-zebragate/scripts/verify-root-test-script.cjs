const fs = require("node:fs");
const path = require("node:path");

const packageJsonPath = path.resolve(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const scripts = packageJson.scripts ?? {};
const testScript = scripts.test;

const requiredCommands = ["pnpm test:api", "pnpm test:web", "pnpm test:desktop"];

if (typeof testScript !== "string") {
  console.error('Root package.json is missing a "test" script.');
  process.exit(1);
}

const missingCommands = requiredCommands.filter((command) => !testScript.includes(command));

if (missingCommands.length > 0) {
  console.error('Root "test" script must execute api, web, and desktop tests.');
  console.error(`Current test script: ${testScript}`);
  console.error(`Missing commands: ${missingCommands.join(", ")}`);
  process.exit(1);
}

console.log('Verified root "test" script includes api, web, and desktop test commands.');
