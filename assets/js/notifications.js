/**
 * Enhanced Notification Helper
 * Provides a consistent API for showing notifications throughout the app
 */

const NotificationHelper = {
  /**
   * Show a success notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {number} timeout - Optional timeout in ms (default: 4000)
   */
  success: function (title, message, timeout) {
    if (typeof notiflix !== "undefined") {
      notiflix.Notify.success(title, message, timeout || 4000);
    } else {
      console.log(`[SUCCESS] ${title}: ${message}`);
    }
  },

  /**
   * Show an error/failure notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {number} timeout - Optional timeout in ms (default: 5000)
   */
  error: function (title, message, timeout) {
    if (typeof notiflix !== "undefined") {
      notiflix.Notify.failure(title, message, timeout || 5000);
    } else {
      console.error(`[ERROR] ${title}: ${message}`);
    }
  },

  /**
   * Show a warning notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {number} timeout - Optional timeout in ms (default: 5000)
   */
  warning: function (title, message, timeout) {
    if (typeof notiflix !== "undefined") {
      notiflix.Notify.warning(title, message, timeout || 5000);
    } else {
      console.warn(`[WARNING] ${title}: ${message}`);
    }
  },

  /**
   * Show an info notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {number} timeout - Optional timeout in ms (default: 4000)
   */
  info: function (title, message, timeout) {
    if (typeof notiflix !== "undefined") {
      notiflix.Notify.info(title, message, timeout || 4000);
    } else {
      console.info(`[INFO] ${title}: ${message}`);
    }
  },

  /**
   * Show a success report modal
   * @param {string} title - Report title
   * @param {string} message - Report message
   * @param {function} callback - Optional callback when OK is clicked
   */
  reportSuccess: function (title, message, callback) {
    if (typeof notiflix !== "undefined") {
      notiflix.Report.success(title, message, "OK", callback);
    } else {
      console.log(`[REPORT SUCCESS] ${title}: ${message}`);
      if (callback) callback();
    }
  },

  /**
   * Show an error report modal
   * @param {string} title - Report title
   * @param {string} message - Report message
   * @param {function} callback - Optional callback when OK is clicked
   */
  reportError: function (title, message, callback) {
    if (typeof notiflix !== "undefined") {
      notiflix.Report.failure(title, message, "OK", callback);
    } else {
      console.error(`[REPORT ERROR] ${title}: ${message}`);
      if (callback) callback();
    }
  },

  /**
   * Show a warning report modal
   * @param {string} title - Report title
   * @param {string} message - Report message
   * @param {function} callback - Optional callback when OK is clicked
   */
  reportWarning: function (title, message, callback) {
    if (typeof notiflix !== "undefined") {
      notiflix.Report.warning(title, message, "OK", callback);
    } else {
      console.warn(`[REPORT WARNING] ${title}: ${message}`);
      if (callback) callback();
    }
  },

  /**
   * Show an info report modal
   * @param {string} title - Report title
   * @param {string} message - Report message
   * @param {function} callback - Optional callback when OK is clicked
   */
  reportInfo: function (title, message, callback) {
    if (typeof notiflix !== "undefined") {
      notiflix.Report.info(title, message, "OK", callback);
    } else {
      console.info(`[REPORT INFO] ${title}: ${message}`);
      if (callback) callback();
    }
  },

  /**
   * Show a confirmation modal
   * @param {string} title - Confirm title
   * @param {string} message - Confirm message
   * @param {function} okCallback - Callback when OK is clicked
   * @param {function} cancelCallback - Optional callback when Cancel is clicked
   */
  confirm: function (title, message, okCallback, cancelCallback) {
    if (typeof notiflix !== "undefined") {
      notiflix.Confirm.show(
        title,
        message,
        okCallback,
        cancelCallback || function () {},
        "Confirm",
        "Cancel"
      );
    } else {
      console.log(`[CONFIRM] ${title}: ${message}`);
      if (okCallback) okCallback();
    }
  },

  /**
   * Show a loading indicator
   * @param {string} message - Loading message
   * @returns {function} Function to hide the loading indicator
   */
  loading: function (message) {
    if (typeof notiflix !== "undefined") {
      notiflix.Loading.show({
        message: message || "Loading...",
        backgroundColor: "rgba(0,0,0,0.8)",
        fontFamily: "Noto Sans, sans-serif",
      });
      return function () {
        notiflix.Loading.hide();
      };
    } else {
      console.log(`[LOADING] ${message}`);
      return function () {};
    }
  },

  /**
   * Hide loading indicator
   */
  hideLoading: function () {
    if (typeof notiflix !== "undefined") {
      notiflix.Loading.hide();
    }
  },
};

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = NotificationHelper;
}
