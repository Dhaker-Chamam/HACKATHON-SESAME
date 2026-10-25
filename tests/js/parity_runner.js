// Runs static/engine.js on a list of cases and prints the results as JSON (used by tests/test_parity.py).
const fs = require("fs");
const path = require("path");
const engine = require(path.join(__dirname, "..", "..", "static", "engine.js"));

const [dataDir, caseFile] = process.argv.slice(2);
const data = {
  destinations: JSON.parse(fs.readFileSync(path.join(dataDir, "destinations.json"), "utf8")),
  devices: JSON.parse(fs.readFileSync(path.join(dataDir, "devices.json"), "utf8")),
};
const cases = JSON.parse(fs.readFileSync(caseFile, "utf8"));
process.stdout.write(JSON.stringify(cases.map((c) => engine.assess(data, c))));
