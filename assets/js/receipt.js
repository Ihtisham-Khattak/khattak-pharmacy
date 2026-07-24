/**
 * Shared thermal-friendly receipt HTML builder for PharmaSpot.
 * Optimized for ~80mm receipt printers and on-screen preview.
 */

const validator = require("validator");
const _ = require("lodash");
const { moneyFormat } = require("./utils");

function getDOMPurify() {
  try {
    const purify = require("dompurify");
    if (purify && typeof purify.sanitize === "function") {
      return purify;
    }
    if (typeof window !== "undefined") {
      return purify(window);
    }
  } catch (e) {
    // ignore
  }
  return {
    sanitize: (html) => String(html == null ? "" : html),
  };
}

const DOMPurify = getDOMPurify();

function text(value, fallback = "") {
  const raw = value == null || value === "" ? fallback : String(value);
  return _.escape(validator.unescape(raw));
}

function money(symbol, amount) {
  const num = parseFloat(amount);
  const formatted = moneyFormat((isNaN(num) ? 0 : num).toFixed(2));
  return `${text(symbol, "$")}${formatted}`;
}

function buildItemRows(items, symbol) {
  if (!Array.isArray(items) || !items.length) {
    return `<tr><td colspan="3" style="padding:6px 0;color:#666;">No items</td></tr>`;
  }

  return items
    .map((item) => {
      const name = text(item.product_name || item.name || "Item");
      const qty = parseFloat(item.quantity) || 0;
      const unit = parseFloat(item.price) || 0;
      const line = unit * qty;
      return `<tr>
        <td style="padding:4px 0;vertical-align:top;width:52%;word-break:break-word;">${name}</td>
        <td style="padding:4px 0;text-align:center;vertical-align:top;width:16%;">${qty}</td>
        <td style="padding:4px 0;text-align:right;vertical-align:top;width:32%;">${money(symbol, line)}</td>
      </tr>
      <tr>
        <td colspan="3" style="padding:0 0 6px 0;font-size:10px;color:#666;">
          @ ${money(symbol, unit)} each
        </td>
      </tr>`;
    })
    .join("");
}

/**
 * @param {object} opts
 * @returns {string} sanitized receipt HTML
 */
function buildReceipt(opts) {
  const settings = opts.settings || {};
  const symbol = settings.symbol || "$";
  const store = text(settings.store, "PharmaSpot");
  const addressOne = text(settings.address_one);
  const addressTwo = text(settings.address_two);
  const contact = text(settings.contact);
  const taxId = text(settings.tax);
  const footer = text(settings.footer, "Thank you for your purchase.");
  const logoHtml =
    opts.logoPath
      ? `<img class="ps-receipt-logo" src="${text(opts.logoPath)}" alt="" />`
      : "";

  const discount = parseFloat(opts.discount) || 0;
  const taxAmount = parseFloat(opts.taxAmount) || 0;
  const paid = parseFloat(opts.paid);
  const change = parseFloat(opts.change) || 0;
  const hasPaid = opts.paid !== "" && opts.paid != null && !isNaN(paid);
  const statusBanner = opts.statusLabel
    ? `<div class="ps-receipt-status">${text(opts.statusLabel)}</div>`
    : "";

  const taxRow =
    settings.charge_tax && taxAmount > 0
      ? `<tr>
          <td>Tax (${text(settings.percentage, "0")}%)</td>
          <td class="ps-receipt-num">${money(symbol, taxAmount)}</td>
        </tr>`
      : "";

  const discountRow =
    discount > 0
      ? `<tr>
          <td>Discount</td>
          <td class="ps-receipt-num">-${money(symbol, discount)}</td>
        </tr>`
      : "";

  const paidRows = hasPaid
    ? `<tr>
        <td>Paid (${text(opts.paymentMethod, "Cash")})</td>
        <td class="ps-receipt-num">${money(symbol, paid)}</td>
      </tr>
      ${
        change > 0
          ? `<tr>
              <td>Change</td>
              <td class="ps-receipt-num">${money(symbol, change)}</td>
            </tr>`
          : ""
      }`
    : "";

  const html = `
  <div class="ps-receipt">
    <div class="ps-receipt-brand">
      ${logoHtml}
      <div class="ps-receipt-store">${store}</div>
      ${addressOne ? `<div>${addressOne}</div>` : ""}
      ${addressTwo ? `<div>${addressTwo}</div>` : ""}
      ${contact ? `<div>Tel: ${contact}</div>` : ""}
      ${taxId ? `<div>Tax ID: ${taxId}</div>` : ""}
    </div>

    ${statusBanner}

    <div class="ps-receipt-rule"></div>

    <table class="ps-receipt-meta">
      <tr>
        <td>Order</td>
        <td class="ps-receipt-num">${text(opts.orderNumber)}</td>
      </tr>
      <tr>
        <td>Date</td>
        <td class="ps-receipt-num">${text(opts.date)}</td>
      </tr>
      <tr>
        <td>Cashier</td>
        <td class="ps-receipt-num">${text(opts.cashier, "Cashier")}</td>
      </tr>
      <tr>
        <td>Ref</td>
        <td class="ps-receipt-num">${text(opts.refNumber || opts.orderNumber)}</td>
      </tr>
      <tr>
        <td>Customer</td>
        <td class="ps-receipt-num">${text(opts.customerName, "Walk-in Customer")}</td>
      </tr>
    </table>

    <div class="ps-receipt-rule"></div>

    <table class="ps-receipt-items">
      <thead>
        <tr>
          <th style="text-align:left;">Item</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${buildItemRows(opts.items, symbol)}
      </tbody>
    </table>

    <div class="ps-receipt-rule"></div>

    <table class="ps-receipt-totals">
      <tr>
        <td>Subtotal</td>
        <td class="ps-receipt-num">${money(symbol, opts.subtotal)}</td>
      </tr>
      ${discountRow}
      ${taxRow}
      <tr class="ps-receipt-total-row">
        <td>TOTAL</td>
        <td class="ps-receipt-num">${money(symbol, opts.total)}</td>
      </tr>
      ${paidRows}
    </table>

    <div class="ps-receipt-rule"></div>

    <div class="ps-receipt-footer">
      <div>${footer}</div>
      ${contact ? `<div>Questions? ${contact}</div>` : ""}
    </div>
  </div>`;

  return DOMPurify.sanitize(html, { ALLOW_UNKNOWN_PROTOCOLS: true });
}

module.exports = {
  buildReceipt,
};
