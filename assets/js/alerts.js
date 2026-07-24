/**
 * Consistent alert/confirm wrappers around Notiflix for PharmaSpot.
 * Prefer these helpers over ad-hoc notiflix calls for new code.
 */

function getNotiflix() {
  try {
    return require("notiflix");
  } catch (e) {
    return null;
  }
}

const Alerts = {
  success(title, message) {
    const n = getNotiflix();
    if (n) n.Report.success(String(title), String(message), "Ok");
  },

  error(title, message) {
    const n = getNotiflix();
    if (n) n.Report.failure(String(title), String(message), "Ok");
  },

  warning(title, message) {
    const n = getNotiflix();
    if (n) n.Report.warning(String(title), String(message), "Ok");
  },

  info(title, message) {
    const n = getNotiflix();
    if (n) n.Report.info(String(title), String(message), "Ok");
  },

  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {string} [opts.okText]
   * @param {string} [opts.cancelText]
   * @param {Function} opts.onConfirm
   * @param {Function} [opts.onCancel]
   */
  confirm(opts) {
    const n = getNotiflix();
    if (!n) {
      if (typeof opts.onConfirm === "function") opts.onConfirm();
      return;
    }
    n.Confirm.show(
      String(opts.title || "Confirm"),
      String(opts.message || "Are you sure?"),
      String(opts.okText || "Yes"),
      String(opts.cancelText || "Cancel"),
      typeof opts.onConfirm === "function" ? opts.onConfirm : () => {},
      typeof opts.onCancel === "function" ? opts.onCancel : () => {},
    );
  },
};

module.exports = Alerts;
