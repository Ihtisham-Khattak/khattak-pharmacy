/**
 * Load UMD jQuery plugins in Electron.
 *
 * With nodeIntegration, many vendor UMD builds detect `module.exports` and
 * take the CommonJS branch — often skipping window.$.fn. Evaluating them with
 * module/exports undefined forces the browser branch against window.jQuery.
 */
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadBrowserUmd(relativePath) {
  const cleaned = String(relativePath || "").replace(/^\.\//, "");
  const absolutePath = path.join(PROJECT_ROOT, cleaned);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`jQuery plugin not found: ${absolutePath}`);
  }
  const code = fs.readFileSync(absolutePath, "utf8");
  // eslint-disable-next-line no-new-func
  const runner = new Function(
    "window",
    "document",
    "jQuery",
    "$",
    "moment",
    "require",
    "module",
    "exports",
    "define",
    code + "\n//# sourceURL=" + absolutePath,
  );
  runner(
    window,
    document,
    window.jQuery,
    window.$,
    window.moment,
    require,
    undefined,
    undefined,
    undefined,
  );
}

function assertPlugin(name, predicate) {
  if (!predicate()) {
    throw new Error(
      `Failed to load jQuery plugin "${name}". UI cannot start safely.`,
    );
  }
}

module.exports = {
  loadBrowserUmd,
  assertPlugin,
};
