window.$ = window.jQuery = require("jquery");
window.moment = require("moment");

const { loadBrowserUmd, assertPlugin } = require("./assets/js/loadBrowserUmd");

// Force browser-UMD attachment under Electron nodeIntegration.
loadBrowserUmd("./assets/plugins/bootstrap/bootstrap.min.js");
loadBrowserUmd("./assets/plugins/chosen/chosen.jquery.min.js");
loadBrowserUmd("./assets/plugins/jquery-ui/jquery.form.min.js");
loadBrowserUmd("./assets/plugins/daterangepicker/daterangepicker.min.js");
loadBrowserUmd("./assets/plugins/dataTables/jquery.dataTables.min.js");
loadBrowserUmd("./assets/plugins/dataTables/dataTables.bootstrap.min.js");
loadBrowserUmd("./assets/plugins/dataTables/dataTables.buttons.min.js");
loadBrowserUmd("./assets/plugins/dataTables/buttons.html5.min.js");

assertPlugin("bootstrap.modal", () => typeof window.$.fn.modal === "function");
assertPlugin(
  "daterangepicker",
  () => typeof window.$.fn.daterangepicker === "function",
);

require("./assets/js/pos.js");
require("./assets/js/product-filter.js");
require("./assets/js/checkout.js");
require("print-js");
