const { spawnSync } = require("node:child_process");
const path = require("node:path");

function classifyError(message) {
  const script = path.join(__dirname, "classifier.py");
  const result = spawnSync("python3", [script], {
    input: JSON.stringify({ message }),
    encoding: "utf8",
    timeout: 3000,
  });

  if (result.error || result.status !== 0) {
    return {
      type: "UnknownType",
      severity: "UnknownSeverity",
    };
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch (_error) {
    return {
      type: "UnknownType",
      severity: "UnknownSeverity",
    };
  }
}

module.exports = {
  classifyError,
};
