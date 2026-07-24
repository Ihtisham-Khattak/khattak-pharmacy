const jsPDF = require("jspdf");
const html2canvas = require("html2canvas");
const macaddress = require("macaddress");
const notiflix = require("notiflix");
const validator = require("validator");
const DOMPurify = require("dompurify");
const _ = require("lodash");
let fs = require("fs");
let path = require("path");
let moment = require("moment");
let { ipcRenderer } = require("electron");
let dotInterval = setInterval(function () {
  $(".dot").text(".");
}, 3000);
let Store = require("electron-store");
const crypto = require("crypto");
const remote = require("@electron/remote");
const app = remote.app;
let cart = [];
let index = 0;
let allUsers = [];
let allProducts = [];
let allCategories = [];
let allTransactions = [];
let sold = [];
let state = [];
let sold_items = [];
let item;
let auth;
let holdOrder = 0;
let vat = 0;
let perms = null;
let deleteId = 0;
let receipt = "";
let totalVat = 0;
let subTotal = 0;
let method = "";
let order_index = 0;
let user_index = 0;
let product_index = 0;
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
let host = "localhost";
let port = process.env.PORT;
let img_path = path.join(appData, appName, "uploads", "/");
let api = "http://" + host + ":" + port + "/api/";
let categories = [];
let holdOrderList = [];
let customerOrderList = [];
let ownUserEdit = null;
let totalPrice = 0;
let orderTotal = 0;
let auth_error = "Incorrect username or password";
let auth_empty = "Please enter a username and password";
let holdOrderlocation = $("#renderHoldOrders");
let customerOrderLocation = $("#renderCustomerOrders");
let storage = new Store();
let settings;
let platform;
let user = {};
let start = moment().startOf("month");
let end = moment();
let start_date = moment(start).toDate().toJSON();
let end_date = moment(end).toDate().toJSON();
let by_till = 0;
let by_user = 0;
let by_status = 1;
const default_item_img = path.join("assets", "images", "default.jpg");
const permissions = [
  "perm_products",
  "perm_categories",
  "perm_transactions",
  "perm_users",
  "perm_settings",
];

// Enhanced Notiflix configuration for better UX
function initNotiflix() {
  notiflix.Notify.init({
    position: window.innerWidth < 768 ? "center-top" : "right-top",
    timeout: 4000,
    cssAnimationDuration: 300,
    messageMaxLength: 200,
    clickToClose: true,
    closeButton: true,
    useIcon: true,
    showOnlyTheLastOne: false,
    maxNumberOfNotifications: 4,
    gap: 10,
    ID: "notiflix-notify",
    className: "notiflix-notify",
    zindex: 9999,
    title: {
      success: "Success",
      failure: "Error",
      warning: "Warning",
      info: "Info",
    },
    message: {
      success: "Operation completed successfully",
      failure: "An error occurred",
      warning: "Please check your input",
      info: "Here's some information",
    },
  });
}

initNotiflix();

// Update notification position on resize
window.addEventListener(
  "resize",
  _.debounce(() => {
    initNotiflix();
  }, 250),
);

// Enhanced Report configuration
notiflix.Report.init({
  className: "notiflix-report",
  width: "400px",
  position: "center",
  distance: "10px",
  borderRadius: "16px",
  zindex: 10000,
  icon: true,
  showIcon: true,
  cssAnimation: true,
  cssAnimationDuration: 300,
  popupEffect: "scale",
  buttons: {
    ok: "OK",
  },
  title: {
    success: "Success",
    failure: "Error",
    warning: "Warning",
    info: "Info",
  },
  message: {
    success: "Operation completed successfully",
    failure: "An error occurred",
    warning: "Please check your input",
    info: "Here's some information",
  },
});

// Enhanced Confirm configuration
notiflix.Confirm.init({
  className: "notiflix-confirm",
  width: "400px",
  position: "center",
  distance: "10px",
  borderRadius: "16px",
  zindex: 10001,
  icon: true,
  showIcon: true,
  cssAnimation: true,
  cssAnimationDuration: 300,
  popupEffect: "scale",
  buttons: {
    ok: "Confirm",
    cancel: "Cancel",
  },
  title: {
    confirm: "Confirm Action",
  },
  message: {
    confirm: "Are you sure you want to proceed?",
  },
});
const {
  DATE_FORMAT,
  moneyFormat,
  isExpired,
  daysToExpire,
  getStockStatus,
  checkFileExists,
  setContentSecurityPolicy,
} = require("./utils");
const Pagination = require("./pagination");
const { buildReceipt } = require("./receipt");
const Alerts = require("./alerts");

let productListPage = 1;
let productListLimit = 10;
let categoryListPage = 1;
let categoryListLimit = 10;

function showAppView(viewId) {
  $(
    "#pos_view, #transactions_view, #out_of_stock_view, #products_view, #categories_view",
  ).hide();
  $("#pointofsale").show();
  $("#transactions").show();
  if (viewId === "#pos_view") {
    $("#pointofsale").hide();
  }
  if (viewId === "#transactions_view") {
    $("#transactions").hide();
  }
  $(viewId).show();
}

function populateProductCategoryFilter() {
  const $filter = $("#productCategoryFilter");
  if (!$filter.length) return;
  const current = $filter.val() || "";
  let options = `<option value="">All Categories</option>`;
  (allCategories || []).forEach((cat) => {
    const name = DOMPurify.sanitize(String(cat.name || ""));
    options += `<option value="${cat.id}">${name}</option>`;
  });
  $filter.html(options);
  $filter.val(current);
}

function generateHoldRef() {
  const day = moment().format("YYYYMMDD");
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `HOLD-${day}-${rand}`;
}

function isValidHoldPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function formatMoneyAmount(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  return moneyFormat(num.toFixed(2));
}

function updateHoldOrderTotalDisplay() {
  const symbol =
    settings && settings.symbol
      ? validator.unescape(String(settings.symbol))
      : "";
  const total = orderTotal || "0.00";
  $("#holdOrderTotal").text(symbol + formatMoneyAmount(total));
}

function clearHoldFormFields() {
  $("#refNumber").val("");
  $("#holdCustomerName").val("");
  $("#holdCustomerPhone").val("");
  $("#holdOrderTotal").text("0.00");
}

const CART_DRAFT_KEY = "pos_draft_cart";

function persistCartState() {
  try {
    if (!storage) return;
    if (!cart || cart.length === 0) {
      storage.delete(CART_DRAFT_KEY);
      return;
    }
    storage.set(CART_DRAFT_KEY, {
      cart: cart,
      holdOrder: holdOrder || 0,
      discount: $("#inputDiscount").val() || "0",
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("Failed to persist cart:", err);
  }
}

function clearPersistedCart() {
  try {
    if (storage) storage.delete(CART_DRAFT_KEY);
  } catch (err) {
    console.error("Failed to clear persisted cart:", err);
  }
}

function restorePersistedCart() {
  try {
    if (!storage) return false;
    const saved = storage.get(CART_DRAFT_KEY);
    if (!saved || !Array.isArray(saved.cart) || saved.cart.length === 0) {
      return false;
    }
    cart = saved.cart
      .filter((item) => item && item.id != null)
      .map((item) => ({
        id: item.id,
        product_name: item.product_name || "Unknown",
        sku: item.sku || "",
        price: parseFloat(item.price) || 0,
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
        stock_quantity:
          item.stock_quantity != null
            ? parseInt(item.stock_quantity, 10)
            : undefined,
        stock: item.stock != null ? item.stock : 1,
      }));
    if (!cart.length) {
      clearPersistedCart();
      return false;
    }
    holdOrder = saved.holdOrder || 0;
    if (saved.discount != null) {
      $("#inputDiscount").val(saved.discount);
    }
    $.fn.renderTable(cart);
    return true;
  } catch (err) {
    console.error("Failed to restore cart:", err);
    return false;
  }
}

//set the content security policy of the app
setContentSecurityPolicy();

// Whitelist-sanitize a stored logo filename before it is ever string-interpolated
// into an HTML attribute (e.g. src='...'). This must happen BEFORE interpolation,
// since DOMPurify sanitizing the assembled HTML afterwards is too late to stop an
// attribute-breakout injection at the point the string is built.
function safeLogoFilename(name) {
  if (!name || typeof name !== "string") return "";
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

$(function () {
  function cb(start, end) {
    $("#reportrange span").html(
      start.format("MMMM D, YYYY") + "  -  " + end.format("MMMM D, YYYY"),
    );
  }

  $("#reportrange").daterangepicker(
    {
      startDate: start,
      endDate: end,
      autoApply: true,
      timePicker: true,
      timePicker24Hour: true,
      timePickerIncrement: 10,
      timePickerSeconds: true,
      // minDate: '',
      ranges: {
        Today: [moment().startOf("day"), moment()],
        Yesterday: [
          moment().subtract(1, "days").startOf("day"),
          moment().subtract(1, "days").endOf("day"),
        ],
        "Last 7 Days": [
          moment().subtract(6, "days").startOf("day"),
          moment().endOf("day"),
        ],
        "Last 30 Days": [
          moment().subtract(29, "days").startOf("day"),
          moment().endOf("day"),
        ],
        "This Month": [moment().startOf("month"), moment().endOf("month")],
        "This Month": [moment().startOf("month"), moment()],
        "Last Month": [
          moment().subtract(1, "month").startOf("month"),
          moment().subtract(1, "month").endOf("month"),
        ],
      },
    },
    cb,
  );

  cb(start, end);

  window.renderPagination = function (total, limit, page, type, container) {
    Pagination.renderLegacy(
      total,
      limit,
      page,
      type,
      container,
      window.__paginationHandlers || {},
    );
  };

  $("#expirationDate").daterangepicker({
    singleDatePicker: true,
    locale: {
      format: DATE_FORMAT,
    },
  });
});

//Allow only numbers in input field
$.fn.allowOnlyNumbers = function () {
  return this.on("keydown", function (e) {
    // Allow: backspace, delete, tab, escape, enter, ., ctrl/cmd+A, ctrl/cmd+C, ctrl/cmd+X, ctrl/cmd+V, end, home, left, right, down, up
    if (
      $.inArray(e.keyCode, [46, 8, 9, 27, 13, 110, 190]) !== -1 ||
      (e.keyCode >= 35 && e.keyCode <= 40) ||
      ((e.keyCode === 65 ||
        e.keyCode === 67 ||
        e.keyCode === 86 ||
        e.keyCode === 88) &&
        (e.ctrlKey === true || e.metaKey === true))
    ) {
      return;
    }
    // Ensure that it is a number and stop the keypress
    if (
      (e.shiftKey || e.keyCode < 48 || e.keyCode > 57) &&
      (e.keyCode < 96 || e.keyCode > 105)
    ) {
      e.preventDefault();
    }
  });
};
$(".number-input").allowOnlyNumbers();

//Serialize Object
$.fn.serializeObject = function () {
  var o = {};
  var a = this.serializeArray();
  $.each(a, function () {
    if (o[this.name]) {
      if (!o[this.name].push) {
        o[this.name] = [o[this.name]];
      }
      o[this.name].push(this.value || "");
    } else {
      o[this.name] = this.value || "";
    }
  });
  return o;
};

auth = storage.get("auth");
user = storage.get("user");

let token = storage.get("token");
if (token) {
  $.ajaxSetup({ headers: { "X-Access-Token": token } });
}

$(document).ajaxError(function (event, jqXHR) {
  if (jqXHR.status === 401) {
    storage.clear();
    ipcRenderer.send("app-reload", "");
  }
});

$("#main_app").hide();
if (auth == undefined) {
  $.get(api + "users/check/", function (data) {});

  authenticate();
} else {
  $("#login").hide();
  $("#main_app").show();
  platform = storage.get("settings");

  if (platform != undefined) {
    if (platform.app == "Network Point of Sale Terminal") {
      api = "http://" + platform.ip + ":" + port + "/api/";
    }
  }

  $.get(api + "users/user/" + user.id, function (data) {
    user = data;
    $("#loggedin-user").text(user.fullname);
  });

  $.get(api + "settings/get", function (data) {
    settings = data.settings;
  });

  $.get(api + "users/all", function (users) {
    allUsers = [...users];
  });

  $(document).ready(function () {
    //update title based on company
    let appTitle = !!settings
      ? `${validator.unescape(String(settings.store))} - ${appName}`
      : appName;
    $("title").text(appTitle);

    $(".loading").hide();

    loadCategories();
    loadProducts();
    // Restore in-progress cart after settings/user are available.
    setTimeout(function () {
      restorePersistedCart();
    }, 400);

    window.__paginationHandlers = {
      loadProducts: function (p) {
        loadProducts(p);
      },
      loadProductList: function (p) {
        loadProductList(p);
      },
      loadCategoryList: function (p) {
        loadCategoryList(p);
      },
      loadUserList: function (p) {
        loadUserList(p);
      },
    };

    // Search Handler
    let searchTimeout;
    $("#search").on("input", function () {
      clearTimeout(searchTimeout);
      let query = $(this).val();
      searchTimeout = setTimeout(() => {
        loadProducts(1, query);
      }, 300);
    });

    $("#searchProductList").on("input", function () {
      clearTimeout(searchTimeout);
      let query = $(this).val();
      searchTimeout = setTimeout(() => {
        productListPage = 1;
        loadProductList(1, query);
      }, 300);
    });

    $("#productCategoryFilter").on("change", function () {
      productListPage = 1;
      loadProductList(1);
    });

    $("#searchCategoryList").on("input", function () {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        categoryListPage = 1;
        loadCategoryList(1);
      }, 300);
    });

    $("#addProductFromPage").on("click", function () {
      $("#saveProduct").get(0).reset();
      $("#current_img").text("");
      $("#product_id").val("");
    });

    $("#addCategoryFromPage").on("click", function () {
      $("#categoryName").val("");
      $("#category_id").val("");
    });

    if (settings && validator.unescape(String(settings.symbol))) {
      $("#price_curr, #payment_curr, #change_curr").text(
        validator.unescape(String(settings.symbol)),
      );
    }

    setTimeout(function () {
      if (settings == undefined && auth != undefined) {
        $("#settingsModal").modal("show");
      } else {
        vat = parseFloat(validator.unescape(String(settings.percentage)));
        $("#taxInfo").text(settings.charge_tax ? vat : 0);
      }
    }, 1500);

    $("#settingsModal").on("hide.bs.modal", function () {
      setTimeout(function () {
        if (settings == undefined && auth != undefined) {
          $("#settingsModal").modal("show");
        }
      }, 1000);
    });

    if (0 == user.perm_products) {
      $(".p_one").hide();
    }
    if (0 == user.perm_categories) {
      $(".p_two").hide();
    }
    if (0 == user.perm_transactions) {
      $(".p_three").hide();
    }
    if (0 == user.perm_users) {
      $(".p_four").hide();
    }
    if (0 == user.perm_settings) {
      $(".p_five").hide();
    }

    function loadProducts(page = 1, query = "") {
      let limit = 10;
      let url = api + "inventory/products?page=" + page + "&limit=" + limit;
      if (query != "") url += "&q=" + query;

      $.get(url, function (response) {
        let data = response.data;
        let total = response.total;

        allProducts = [...data];

        let delay = 0;
        let expiredCount = 0;
        allProducts.forEach((product) => {
          let todayDate = moment();
          let expiryDate = moment(product.expirationDate, DATE_FORMAT);

          if (!isExpired(expiryDate)) {
            const diffDays = daysToExpire(expiryDate);

            if (diffDays > 0 && diffDays <= 30) {
              var days_noun = diffDays > 1 ? "days" : "day";
              notiflix.Notify.warning(
                `${product.name} has only ${diffDays} ${days_noun} left to expiry`,
              );
            }
          } else {
            expiredCount++;
          }
        });

        //Show notification if there are any expired goods. (Only on first page load?)
        if (expiredCount > 0 && page == 1 && query == "") {
          notiflix.Notify.failure(
            `${expiredCount} ${
              expiredCount > 0 ? "products" : "product"
            } expired. Please restock!`,
          );
        }

        $("#parent").empty();
        $("#parent").append(
          `<div class="col-md-12">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Generic</th>
                        <th>Product Name</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="pos_product_list"></tbody>
            </table>
        </div>`,
        );

        data.forEach((item) => {
          if (!categories.includes(item.category_id)) {
            categories.push(item.category_id);
          }

          let item_isExpired = isExpired(item.expirationDate);
          let item_stockStatus = getStockStatus(item.quantity, item.minStock);
          let safe_item_generic = DOMPurify.sanitize(String(item.generic || ""));
          let safe_item_name = DOMPurify.sanitize(String(item.name || ""));

          let row = `<tr>
              <td>${item.generic && item.generic !== "undefined" ? safe_item_generic : safe_item_name}</td>
              <td><span class="${item_isExpired ? "text-danger" : ""}">${safe_item_name}</span> <br><small class="sku">${item.id}</small></td>
              <td>${validator.unescape(settings.symbol) + moneyFormat(item.price)}</td>
              <td>
                  <span class="${item_stockStatus < 1 ? "text-danger" : ""}">${
                    item.stock == 1 ? item.quantity : "N/A"
                  }</span>
              </td>
              <td>
                  <button class="btn btn-primary btn-sm" onclick="$(this).addToCart(${item.id}, ${item.quantity}, ${item.stock})">
                      <i class="fa fa-shopping-cart"></i> Add
                  </button>
              </td>
          </tr>`;
          $("#pos_product_list").append(row);
        });

        renderPagination(total, limit, page, "loadProducts", "#parent");
      });
    }

    function loadCategories() {
      $.get(api + "categories/all?limit=1000", function (data) {
        allCategories = data.data;
        populateProductCategoryFilter();
        $("#category,#categories").html(`<option value="0">Select</option>`);
        allCategories.forEach((category) => {
          $("#category,#categories").append(
            `<option value="${category.id}">${category.name}</option>`,
          );
        });
      });
    }

    // CUSTOMER DROPDOWN - COMMENTED OUT FOR SIMPLICITY
    // function loadCustomers() {
    //   $.get(api + "customers/all", function (customers) {
    //     $("#customer").html(
    //       `<option value="0" selected="selected">Walk in customer</option>`,
    //     );

    //     customers.forEach((cust) => {
    //       let customer = `<option value='{"id": ${cust._id}, "name": "${cust.name}"}'>${cust.name}</option>`;
    //       $("#customer").append(customer);
    //     });
    //   });
    // }

    $.fn.addToCart = function (id, count, stock) {
      $.get(api + "inventory/product/" + id, function (product) {
        if (isExpired(product.expirationDate)) {
          notiflix.Report.failure(
            "Expired",
            `${product.name} is expired! Please restock.`,
            "Ok",
          );
        } else {
          if (count > 0) {
            $(this).addProductToCart(product);
          } else {
            if (stock == 1) {
              notiflix.Report.failure(
                "Out of stock!",
                `${product.name} is out of stock! Please restock.`,
                "Ok",
              );
            }
          }
        }
      });
    };

    $.fn.addProductToCart = function (data) {
      item = {
        id: data.id,
        product_name: data.name,
        sku: data.sku,
        price: data.price,
        quantity: 1,
        stock_quantity: data.quantity, // Store available stock
        stock: data.stock, // Store stock status
      };

      if ($(this).isExist(item)) {
        $(this).qtIncrement(index);
      } else {
        cart.push(item);
        $(this).renderTable(cart);
      }
    };

    $.fn.isExist = function (data) {
      let toReturn = false;
      $.each(cart, function (index, value) {
        if (value.id == data.id) {
          $(this).setIndex(index);
          toReturn = true;
        }
      });
      return toReturn;
    };

    $.fn.setIndex = function (value) {
      index = value;
    };

    $.fn.calculateCart = function () {
      let total = 0;
      let grossTotal;
      let total_items = 0;
      $.each(cart, function (index, data) {
        total += data.quantity * data.price;
        total_items += parseInt(data.quantity);
      });
      $("#total").text(total_items);

      let discountVal = parseFloat($("#inputDiscount").val());
      if (isNaN(discountVal) || discountVal < 0) {
        discountVal = 0;
        $("#inputDiscount").val(0);
      }
      // Compare against pre-discount subtotal (previous bug wiped discounts ≥ ~50%).
      if (discountVal >= total) {
        $("#inputDiscount").val(0);
        discountVal = 0;
      }

      total = total - discountVal;
      $("#price").text(
        validator.unescape(settings.symbol) + moneyFormat(total.toFixed(2)),
      );

      subTotal = total;

      if (settings.charge_tax) {
        totalVat = (total * vat) / 100;
        grossTotal = total + totalVat;
      } else {
        grossTotal = total;
      }

      orderTotal = grossTotal.toFixed(2);

      $("#gross_price").text(
        validator.unescape(settings.symbol) + moneyFormat(orderTotal),
      );
      $("#payablePrice").val(moneyFormat(grossTotal));
    };

    $.fn.renderTable = function (cartList) {
      $("#cartTable .card-body").empty();
      $(this).calculateCart();
      $.each(cartList, function (index, data) {
        $("#cartTable .card-body").append(
          $("<div>", { class: "row m-t-10 align-items-center cart-line" }).append(
            $("<div>", { class: "col-xs-1", text: index + 1 }),
            $("<div>", {
              class: "col-xs-4 cart-item-name",
              text: data.product_name,
            }),
            $("<div>", { class: "col-xs-3" }).append(
              $("<div>", { class: "input-group input-group-sm" }).append(
                $("<span>", { class: "input-group-btn" }).append(
                  $("<button>", {
                    class: "btn btn-light",
                    type: "button",
                    title: "Decrease quantity",
                    onclick: "$(this).qtDecrement(" + index + ")",
                  }).append($("<i>", { class: "fa fa-minus" })),
                ),
                $("<input>", {
                  class: "num-qty form-control text-center",
                  type: "number",
                  min: "1",
                  step: "1",
                  value: data.quantity,
                  "data-index": index,
                  title: "Type quantity and press Enter",
                }),
                $("<span>", { class: "input-group-btn" }).append(
                  $("<button>", {
                    class: "btn btn-light",
                    type: "button",
                    title: "Increase quantity",
                    onclick: "$(this).qtIncrement(" + index + ")",
                  }).append($("<i>", { class: "fa fa-plus" })),
                ),
              ),
            ),
            $("<div>", {
              class: "col-xs-3 text-right",
              text:
                validator.unescape(settings.symbol) +
                moneyFormat((data.price * data.quantity).toFixed(2)),
            }),
            $("<div>", { class: "col-xs-1 text-right" }).append(
              $("<button>", {
                class: "btn btn-light btn-xs",
                type: "button",
                title: "Remove item",
                onclick: "$(this).deleteFromCart(" + index + ")",
              }).append($("<i>", { class: "fa fa-times" })),
            ),
          ),
        );
      });
      persistCartState();
    };

    $(document)
      .off("change.cartQty keydown.cartQty", "#cartTable .num-qty")
      .on("change.cartQty", "#cartTable .num-qty", function () {
        const i = parseInt($(this).data("index"), 10);
        if (!isNaN(i)) {
          $(this).qtInput(i);
        }
      })
      .on("keydown.cartQty", "#cartTable .num-qty", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          $(this).trigger("change");
          $(this).blur();
        }
      });

    $("#inputDiscount")
      .off("change.cartPersist input.cartPersist")
      .on("change.cartPersist", function () {
        persistCartState();
      });

    $.fn.deleteFromCart = function (index) {
      cart.splice(index, 1);
      $(this).renderTable(cart);
      if (!cart.length) clearPersistedCart();
    };

    $.fn.qtIncrement = function (i) {
      item = cart[i];
      if (item.stock == 1) {
        if (item.quantity < item.stock_quantity) {
          item.quantity = parseInt(item.quantity) + 1;
          $(this).renderTable(cart);
        } else {
          notiflix.Report.info(
            "No more stock!",
            "You have already added all the available stock.",
            "Ok",
          );
        }
      } else {
        item.quantity = parseInt(item.quantity) + 1;
        $(this).renderTable(cart);
      }
    };

    $.fn.qtDecrement = function (i) {
      item = cart[i];
      if (item.quantity > 1) {
        item.quantity = parseInt(item.quantity) - 1;
        $(this).renderTable(cart);
      }
    };

    $.fn.qtInput = function (i) {
      item = cart[i];
      let newQuantity = parseInt($(this).val(), 10);

      if (item.stock == 1) {
        if (isNaN(newQuantity) || newQuantity < 1) {
          newQuantity = 1;
        } else if (newQuantity > item.stock_quantity) {
          newQuantity = item.stock_quantity;
          notiflix.Report.info(
            "No more stock!",
            "You have already added all the available stock.",
            "Ok",
          );
        }
      } else {
        if (isNaN(newQuantity) || newQuantity < 1) {
          newQuantity = 1;
        }
      }

      item.quantity = newQuantity;
      $(this).renderTable(cart);
    };

    $.fn.cancelOrder = function () {
      if (cart.length > 0) {
        const diagOptions = {
          title: "Are you sure?",
          text: "You are about to remove all items from the cart.",
          icon: "warning",
          showCancelButton: true,
          okButtonText: "Yes, clear it!",
          cancelButtonText: "Cancel",
          options: {
            // okButtonBackground: "#3085d6",
            cancelButtonBackground: "#d33",
          },
        };

        notiflix.Confirm.show(
          diagOptions.title,
          diagOptions.text,
          diagOptions.okButtonText,
          diagOptions.cancelButtonText,
          () => {
            cart = [];
            holdOrder = 0;
            $(this).renderTable(cart);
            clearPersistedCart();
            notiflix.Report.success(
              "Cleared!",
              "All items have been removed.",
              "Ok",
            );
          },
          "",
          diagOptions.options,
        );
      }
    };

    $("#payButton").on("click", function () {
      if (cart.length != 0) {
        $("#paymentModel").modal("toggle");
      } else {
        notiflix.Report.warning("Oops!", "There is nothing to pay!", "Ok");
      }
    });

    $("#hold").on("click", function () {
      if (cart.length != 0) {
        $(this).calculateCart();
        if (!holdOrder) {
          $("#refNumber").val(generateHoldRef());
          $("#holdCustomerName").val("");
          $("#holdCustomerPhone").val("");
        } else if (!$("#refNumber").val()) {
          $("#refNumber").val(generateHoldRef());
        }
        updateHoldOrderTotalDisplay();
        $("#dueModal").modal("show");
      } else {
        notiflix.Report.warning("Oops!", "There is nothing to hold!", "Ok");
      }
    });

    function printJobComplete() {
      notiflix.Report.success("Done", "print job complete", "Ok");
    }

    $.fn.submitDueOrder = function (status) {
      try {
        // Fix #5: Check if cart is empty at the start
        if (!cart || cart.length === 0) {
          notiflix.Report.warning(
            "Empty Cart",
            "There are no items in the cart to process.",
            "Ok",
          );
          $("#confirmPayment").prop("disabled", false);
          return;
        }

        // Fix #3: Enhanced null checks for settings and platform
        if (!settings || !platform) {
          console.error("Settings or Platform data missing");
          notiflix.Report.failure(
            "Missing Configuration",
            "Application settings are not loaded. Please refresh the page.",
            "Ok",
          );
          $("#confirmPayment").prop("disabled", false);
          return;
        }

        // Hold orders: validate auto-ref + customer contact
        if (status == 0) {
          let refNumber = $("#refNumber").val() || "";
          if (refNumber.trim() === "") {
            $("#refNumber").val(generateHoldRef());
            refNumber = $("#refNumber").val();
          }
          const customerName = ($("#holdCustomerName").val() || "").trim();
          const customerPhone = ($("#holdCustomerPhone").val() || "").trim();
          if (!customerName) {
            notiflix.Report.warning(
              "Customer Required",
              "Enter the customer name for this hold order.",
              "Ok",
            );
            $("#confirmPayment").prop("disabled", false);
            return;
          }
          if (!isValidHoldPhone(customerPhone)) {
            notiflix.Report.warning(
              "Invalid Phone",
              "Enter a valid phone number (7–15 digits).",
              "Ok",
            );
            $("#confirmPayment").prop("disabled", false);
            return;
          }
        }

        // Fix #6: Properly initialize payment type with better fallback
        let $activePayment = $(".list-group-item.active");
        let p_type =
          $activePayment.length > 0 ? $activePayment.data("payment-type") : 1;
        if (!p_type || isNaN(p_type)) {
          p_type = 1; // Default to Cash
        }

        let currentTime = new Date(moment());
        let discount = $("#inputDiscount").val() || 0;
        let customer = 0; // Default to walk-in customer
        let date = moment(currentTime).format("YYYY-MM-DD HH:mm:ss");
        let paymentAmount = ($("#payment").val() || "0").replace(",", "");
        let changeAmount = ($("#change").text() || "0").replace(",", "");
        let paid =
          $("#payment").val() == ""
            ? "0.00"
            : parseFloat(paymentAmount).toFixed(2);
        let change =
          $("#change").text() == ""
            ? "0.00"
            : parseFloat(changeAmount).toFixed(2);
        let refNumber = $("#refNumber").val() || "";
        let orderNumber = holdOrder;
        let type = "";

        switch (p_type) {
          case 1:
            type = "Cash";
            break;
          case 3:
            type = "Card";
            break;
          default:
            type = "Cash";
        }

        // Fix #8: Show loading state with disabled button
        $(".loading").show();
        $("#dueModal button").prop("disabled", true);

        if (holdOrder != 0) {
          orderNumber = holdOrder;
          method = "PUT";
        } else {
          orderNumber = require("crypto").randomUUID();
          method = "POST";
        }

        let logo = settings.img
          ? path.join(img_path, safeLogoFilename(String(settings.img)))
          : "";

        const logoPath = logo && checkFileExists(logo) ? logo : "";
        const holdCustomerName = ($("#holdCustomerName").val() || "").trim();
        // subTotal in calculateCart is after discount; add it back for receipt subtotal.
        const receiptSubtotal =
          parseFloat(subTotal || 0) + (parseFloat(discount) || 0);

        receipt = buildReceipt({
          settings,
          logoPath,
          orderNumber,
          date: moment(currentTime).format("DD MMM YYYY HH:mm"),
          cashier: user.fullname || "Cashier",
          refNumber: refNumber || orderNumber,
          customerName:
            holdCustomerName ||
            (customer == 0 ? "Walk-in Customer" : customer.name),
          items: cart,
          subtotal: receiptSubtotal,
          discount,
          taxAmount: totalVat || 0,
          total: orderTotal || 0,
          paid: status == 0 ? "" : paid,
          change: status == 0 ? 0 : change,
          paymentMethod: type,
          statusLabel: status == 0 ? "HOLD ORDER" : "",
        });

        if (status == 3) {
          if (cart.length > 0) {
            printJS({ printable: receipt, type: "raw-html" });

            $(".loading").hide();
            return;
          } else {
            $(".loading").hide();
            return;
          }
        }

        let data = {
          order: orderNumber,
          ref_number: refNumber,
          hold_customer_name: ($("#holdCustomerName").val() || "").trim(),
          hold_customer_phone: ($("#holdCustomerPhone").val() || "").trim(),
          discount: discount,
          customer: customer,
          status: status,
          subtotal: parseFloat(subTotal || 0).toFixed(2),
          tax: totalVat || 0,
          order_type: 1,
          items: cart,
          date: currentTime,
          payment_type: type,
          payment_info: $("#paymentInfo").val(),
          total: orderTotal || 0,
          paid: paid,
          change: change,
          _id: orderNumber,
          id: orderNumber,
          till: platform.till,
          mac: platform.mac,
          user: user.fullname,
          user_id: user.id,
        };

        $.ajax({
          url: api + "new",
          type: method,
          data: JSON.stringify(data),
          contentType: "application/json; charset=utf-8",
          cache: false,
          processData: false,
          success: function (data) {
            cart = [];
            holdOrder = 0;
            clearPersistedCart();
            receipt = DOMPurify.sanitize(receipt, {
              ALLOW_UNKNOWN_PROTOCOLS: true,
            });
            $("#viewTransaction").html("");
            $("#viewTransaction").html(receipt);
            $("#voidTransactionBtn").hide();
            $("#orderModal").modal("show");
            loadProducts();
            $(".loading").hide();
            // Fix #8: Re-enable buttons
            $("#dueModal button").prop("disabled", false);
            $("#confirmPayment").prop("disabled", false);
            // Clear form fields on success
            clearHoldFormFields();
            $("#change").text("");
            $("#payment,#paymentText").val("");
            $("#dueModal").modal("hide");
            $("#paymentModel").modal("hide");
            $.fn.getHoldOrders();
            $.fn.getCustomerOrders();
            $.fn.renderTable(cart);
          },

          // Fix #1 & #2: Improved error handling with actual error message
          error: function (xhr, textStatus, errorThrown) {
            $(".loading").hide();
            // Fix #2: Use hide instead of toggle to properly close modal
            $("#dueModal").modal("hide");
            // Fix #8: Re-enable buttons
            $("#dueModal button").prop("disabled", false);
            $("#confirmPayment").prop("disabled", false);

            // Fix #1: Get actual error message from server response
            let errorMessage = "An unexpected error occurred.";
            let errorTitle = "Hold Order Failed";

            try {
              if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMessage = xhr.responseJSON.message;
              } else if (xhr.responseText) {
                // Try to parse response text as JSON
                try {
                  let response = JSON.parse(xhr.responseText);
                  errorMessage =
                    response.message || response.error || xhr.responseText;
                } catch (e) {
                  errorMessage = xhr.responseText.substring(0, 200);
                }
              } else if (errorThrown) {
                errorMessage = errorThrown;
              }
            } catch (e) {
              console.error("Error parsing server response:", e);
            }

            console.error("Hold order error:", {
              status: xhr.status,
              statusText: xhr.statusText,
              response: xhr.responseText,
              error: errorThrown,
            });

            notiflix.Report.failure(errorTitle, errorMessage, "Ok");
          },
        });

        // Fix #8: Only clear form fields on success (moved to success callback)
        // Fields are cleared in success handler to prevent data loss on error
      } catch (err) {
        console.error("Critical error in submitDueOrder:", err);
        $(".loading").hide();
        // Fix #8: Re-enable buttons on error
        $("#dueModal button").prop("disabled", false);
        $("#confirmPayment").prop("disabled", false);
        notiflix.Report.failure(
          "Checkout Error",
          "An unexpected error occurred: " + err.message,
          "Ok",
        );
      }
    };

    $.get(api + "on-hold", function (data) {
      holdOrderList = data;
      holdOrderlocation.empty();
      // clearInterval(dotInterval);
      $(this).renderHoldOrders(holdOrderList, holdOrderlocation, 1);
    });

    $.fn.getHoldOrders = function () {
      $.get(api + "on-hold", function (data) {
        holdOrderList = data;
        clearInterval(dotInterval);
        holdOrderlocation.empty();
        $.fn.renderHoldOrders(holdOrderList, holdOrderlocation, 1);
      });
    };

    $.fn.renderHoldOrders = function (data, renderLocation, orderType) {
      $.each(data, function (index, order) {
        const symbol =
          settings && settings.symbol
            ? validator.unescape(String(settings.symbol))
            : "";
        const totalDisplay = symbol + formatMoneyAmount(order.total);
        const customerName = DOMPurify.sanitize(
          String(order.hold_customer_name || "Walk-in customer"),
        );
        const customerPhone = DOMPurify.sanitize(
          String(order.hold_customer_phone || ""),
        );

        const details = $("<p>").append(
          $("<b>", { text: "Ref :" }),
          $("<span>", {
            text: order.ref_number || "N/A",
            class: "ref_number",
          }),
          $("<br>"),
          $("<b>", { text: "Price :" }),
          $("<span>", {
            text: totalDisplay,
            class: "label label-info",
            style: "font-size:14px;",
          }),
          $("<br>"),
          $("<b>", { text: "Items :" }),
          $("<span>", { text: order.items ? order.items.length : 0 }),
          $("<br>"),
          $("<b>", { text: "Customer :" }),
          $("<span>", {
            text: customerName,
            class: "customer_name",
          }),
        );
        if (customerPhone) {
          details.append(
            $("<br>"),
            $("<b>", { text: "Phone :" }),
            $("<span>", { text: customerPhone }),
          );
        }

        renderLocation.append(
          $("<div>", {
            class:
              orderType == 1 ? "col-md-3 order" : "col-md-3 customer-order",
          }).append(
            $("<a>").append(
              $("<div>", { class: "card-box order-box" }).append(
                details,
                $("<button>", {
                  class: "btn btn-danger del",
                  onclick:
                    "$(this).deleteOrder(" + index + "," + orderType + ")",
                }).append($("<i>", { class: "fa fa-trash" })),

                $("<button>", {
                  class: "btn btn-default",
                  onclick:
                    "$(this).orderDetails(" + index + "," + orderType + ")",
                }).append($("<span>", { class: "fa fa-shopping-basket" })),
              ),
            ),
          ),
        );
      });
    };

    $.fn.calculatePrice = function (data) {
      let price = 0;
      $.each(data.items, function (index, product) {
        price += product.price * product.quantity;
      });

      let vat = ((price * (data.vat || 0)) / 100) || 0;
      totalPrice = (price + vat - (data.discount || 0)).toFixed(2);

      return totalPrice;
    };

    $.fn.orderDetails = function (index, orderType) {
      clearHoldFormFields();

      if (orderType == 1) {
        let order = holdOrderList[index];
        $("#refNumber").val(order.ref_number || generateHoldRef());
        $("#holdCustomerName").val(order.hold_customer_name || "");
        $("#holdCustomerPhone").val(order.hold_customer_phone || "");

        holdOrder = order.id;
        cart = [];
        $.each(order.items || [], function (index, product) {
          const qty = product.quantity || 1;
          item = {
            id: product.id || 0,
            product_name: product.product_name || "Unknown",
            sku: product.sku || "",
            price: product.price || 0,
            quantity: qty,
            // Hold already reserved stock; items are immutable on PUT — lock qty.
            stock_quantity: qty,
            stock: 1,
          };
          cart.push(item);
        });
      } else if (orderType == 2) {
        let order = customerOrderList[index];
        $("#refNumber").val(order.ref_number || "");
        $("#holdCustomerName").val(order.hold_customer_name || "");
        $("#holdCustomerPhone").val(order.hold_customer_phone || "");

        $("#customer option:selected").removeAttr("selected");

        holdOrder = order.id;
        cart = [];
        $.each(order.items || [], function (index, product) {
          const qty = product.quantity || 1;
          item = {
            id: product.id || 0,
            product_name: product.product_name || "Unknown",
            sku: product.sku || "",
            price: product.price || 0,
            quantity: qty,
            stock_quantity: qty,
            stock: 1,
          };
          cart.push(item);
        });
      }
      $(this).renderTable(cart);
      updateHoldOrderTotalDisplay();
      $("#holdOrdersModal").modal("hide");
      $("#customerModal").modal("hide");
    };

    $.fn.deleteOrder = function (index, type) {
      switch (type) {
        case 1:
          deleteId = holdOrderList[index].id;
          break;
        case 2:
          deleteId = customerOrderList[index].id;
      }

      notiflix.Confirm.show(
        "Cancel order?",
        "This will cancel the order and restore stock. Continue?",
        "Yes, cancel it",
        "Keep order",
        () => {
          $.ajax({
            url: api + "void/" + deleteId,
            type: "POST",
            contentType: "application/json; charset=utf-8",
            cache: false,
            success: function () {
              $(this).getHoldOrders();
              $(this).getCustomerOrders();

              notiflix.Report.success(
                "Cancelled",
                "The order was cancelled and stock restored.",
                "Ok",
              );
            },
            error: function (xhr) {
              $(".loading").hide();
              let message = "Could not cancel the order.";
              if (xhr.responseJSON && xhr.responseJSON.message) {
                message = xhr.responseJSON.message;
              }
              notiflix.Report.failure("Cancel failed", message, "Ok");
            },
          });
        },
      );
    };

    $.fn.getCustomerOrders = function () {
      $.get(api + "customer-orders", function (data) {
        //clearInterval(dotInterval);
        customerOrderList = data;
        customerOrderLocation.empty();
        $(this).renderHoldOrders(customerOrderList, customerOrderLocation, 2);
      });
    };

    $("#saveCustomer").on("submit", function (e) {
      e.preventDefault();

      let custData = {
        id: Math.floor(Date.now() / 1000),
        name: $("#userName").val(),
        phone: $("#phoneNumber").val(),
        email: $("#emailAddress").val(),
        address: $("#userAddress").val(),
      };

      $.ajax({
        url: api + "customers/customer",
        type: "POST",
        data: JSON.stringify(custData),
        contentType: "application/json; charset=utf-8",
        cache: false,
        processData: false,
        success: function (data) {
          $("#newCustomer").modal("hide");
          notiflix.Report.success(
            "Customer added!",
            "Customer added successfully!",
            "Ok",
          );
          $("#customer option:selected").removeAttr("selected");
          $("#customer").append(
            $("<option>", {
              text: custData.name,
              value: `{"id": ${custData.id}, "name": "${custData.name}"}`,
              selected: "selected",
            }),
          );

          $("#customer")
            .val(`{"id": ${custData.id}, "name": "${custData.name}"}`)
            .trigger("chosen:updated");
        },
        error: function (data) {
          $("#newCustomer").modal("hide");
          notiflix.Report.failure(
            "Error",
            "Something went wrong please try again",
            "Ok",
          );
        },
      });
    });

    $("#confirmPayment").hide();

    $("#cardInfo").hide();

    $("#payment").on("input", function () {
      $(this).calculateChange();
    });
    $("#confirmPayment").on("click", function () {
      // Fix: synchronously lock the button as the very first thing that happens,
      // before any of submitDueOrder's synchronous receipt-building work runs,
      // to prevent a fast double-click from queuing two submissions.
      if ($(this).prop("disabled")) {
        return;
      }

      if ($("#payment").val() == "") {
        notiflix.Report.warning(
          "Nope!",
          "Please enter the amount that was paid!",
          "Ok",
        );
      } else {
        $("#confirmPayment").prop("disabled", true);
        $(this).submitDueOrder(1);
      }
    });

    $("#transactions").on("click", function () {
      loadTransactions();
      loadUserList();
      showAppView("#transactions_view");
      $(this).hide();
    });

    $("#pointofsale").on("click", function () {
      showAppView("#pos_view");
      $(this).hide();
    });

    $("#outOfStockLink").on("click", function (e) {
      e.preventDefault();
      loadOutOfStock();
      showAppView("#out_of_stock_view");
    });

    $("#productModal").on("click", function (e) {
      e.preventDefault();
      populateProductCategoryFilter();
      loadProductList(1);
      showAppView("#products_view");
    });

    $("#categoryModal").on("click", function (e) {
      e.preventDefault();
      loadCategoryList(1);
      showAppView("#categories_view");
    });

    $("#viewRefOrders").on("click", function () {
      setTimeout(function () {
        $("#holdOrderInput").focus();
      }, 500);
    });

    $("#viewCustomerOrders").on("click", function () {
      setTimeout(function () {
        $("#holdCustomerOrderInput").focus();
      }, 500);
    });

    $("#newProductModal").on("click", function () {
      $("#saveProduct").get(0).reset();
      $("#current_img").text("");
      $("#product_id").val("");
    });

    $("#saveProduct").submit(function (e) {
      e.preventDefault();

      $(this).attr("action", api + "inventory/product");
      $(this).attr("method", "POST");

      let data = $(this).serializeObject();

      $.ajax({
        url: api + "inventory/product",
        type: "POST",
        data: JSON.stringify(data),
        contentType: "application/json",
        success: function (response) {
          $("#saveProduct").get(0).reset();
          $("#searchProductList").val("");
          loadProducts();
          loadProductList();
          diagOptions = {
            title: "Product Saved",
            text: "Select an option below to continue.",
            okButtonText: "Add another",
            cancelButtonText: "Close",
          };

          notiflix.Confirm.show(
            diagOptions.title,
            diagOptions.text,
            diagOptions.okButtonText,
            diagOptions.cancelButtonText,
            () => {},
            () => {
              $("#newProduct").modal("hide");
            },
          );
        },
        error: function (jqXHR, textStatus, errorThrown) {
          console.error(jqXHR.responseJSON.message);
          notiflix.Report.failure(
            jqXHR.responseJSON.error,
            jqXHR.responseJSON.message,
            "Ok",
          );
        },
      });
    });

    $("#saveCategory").submit(function (e) {
      e.preventDefault();

      if ($("#category_id").val() == "") {
        method = "POST";
      } else {
        method = "PUT";
      }

      $.ajax({
        type: method,
        url: api + "categories/category",
        data: $(this).serialize(),
        success: function (data, textStatus, jqXHR) {
          $("#saveCategory").get(0).reset();
          loadCategories();
          loadCategoryList(categoryListPage);
          loadProducts();
          diagOptions = {
            title: "Category Saved",
            text: "Select an option below to continue.",
            okButtonText: "Add another",
            cancelButtonText: "Close",
          };

          notiflix.Confirm.show(
            diagOptions.title,
            diagOptions.text,
            diagOptions.okButtonText,
            diagOptions.cancelButtonText,
            () => {},

            () => {
              $("#newCategory").modal("hide");
            },
          );
        },
      });
    });

    $.fn.editProduct = function (id) {
      $.get(api + "inventory/product/" + id, function (product) {
        $("#category option")
          .filter(function () {
            return $(this).val() == product.category_id;
          })
          .prop("selected", true);

        $("#productName").val(product.name);
        $("#product_price").val(product.price);
        $("#quantity").val(product.quantity);
        $("#expirationDate").val(product.expirationDate);
        $("#minStock").val(product.minStock || 1);
        $("#productGeneric").val(product.generic);
        $("#strength").val(product.strength);
        $("#form").val(product.form);
        $("#product_id").val(product.id);

        if (product.stock == 0) {
          $("#stock").prop("checked", true);
        }

        $("#newProduct").modal("show");
      });
    };

    $("#userModal").on("hide.bs.modal", function () {
      $(".perms").hide();
    });

    $.fn.editUser = function (id) {
      $("#Users").modal("hide");
      $.get(api + "users/user/" + id, function (user) {
        $(".perms").show();

        $("#user_id").val(user.id);
        $("#fullname").val(user.fullname);
        $("#username").val(validator.unescape(user.username));
        $("#password").attr("placeholder", "New Password");

        for (perm of permissions) {
          var el = "#" + perm;
          if (user[perm] == 1) {
            $(el).prop("checked", true);
          } else {
            $(el).prop("checked", false);
          }
        }

        $("#userModal").modal("show");
      });
    };

    $.fn.editCategory = function (id) {
      $.get(api + "categories/category/" + id, function (category) {
        $("#categoryName").val(category.name);
        $("#category_id").val(category.id);
        $("#newCategory").modal("show");
      });
    };

    $.fn.deleteProduct = function (id) {
      diagOptions = {
        title: "Are you sure?",
        text: "You are about to delete this product.",
        okButtonText: "Yes, delete it!",
        cancelButtonText: "Cancel",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.ajax({
            url: api + "inventory/product/" + id,
            type: "DELETE",
            success: function (result) {
              loadProducts();
              notiflix.Report.success("Done!", "Product deleted", "Ok");
            },
          });
        },
      );
    };

    $.fn.deleteUser = function (id) {
      diagOptions = {
        title: "Are you sure?",
        text: "You are about to delete this user.",
        cancelButtonColor: "#d33",
        okButtonText: "Yes, delete!",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.ajax({
            url: api + "users/user/" + id,
            type: "DELETE",
            success: function (result) {
              loadUserList();
              notiflix.Report.success("Done!", "User deleted", "Ok");
            },
          });
        },
      );
    };

    $.fn.deleteCategory = function (id) {
      diagOptions = {
        title: "Are you sure?",
        text: "You are about to delete this category.",
        okButtonText: "Yes, delete it!",
        cancelButtonText: "Cancel",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.ajax({
            url: api + "categories/category/" + id,
            type: "DELETE",
            success: function (result) {
              loadCategories();
              loadCategoryList(categoryListPage);
              notiflix.Report.success("Done!", "Category deleted", "Ok");
            },
          });
        },
      );
    };

    $("#usersModal").on("click", function () {
      loadUserList();
    });

    function loadUserList(page = 1) {
      let limit = 10;
      let url = api + "users/all?page=" + page + "&limit=" + limit;

      $.get(url, function (response) {
        let users = response.data;
        let total = response.total;
        allUsers = [...users];

        let counter = 0;
        let user_list = "";
        $("#user_list").empty();

        users.forEach((user, index) => {
          state = [];
          let class_name = "";

          if (user.status != "") {
            state = user.status.split("_");
            login_status = state[0];
            login_time = state[1];

            switch (
              login_status
            ) {
              case "Logged In":
                class_name = "btn-default";

                break;
              case "Logged Out":
                class_name = "btn-light";
                break;
            }
          }

          counter++;
          let safe_user_fullname = DOMPurify.sanitize(String(user.fullname || ""));
          let safe_user_username = DOMPurify.sanitize(String(user.username || ""));
          user_list += `<tr>
            <td>${safe_user_fullname}</td>
            <td>${safe_user_username}</td>
            <td class="${class_name}">${
              state.length > 0 ? login_status : ""
            } <br><small> ${state.length > 0 ? login_time : ""}</small></td>
            <td>${
              user.id == 1
                ? '<span class="btn-group"><button class="btn btn-dark"><i class="fa fa-edit"></i></button><button class="btn btn-dark"><i class="fa fa-trash"></i></button></span>'
                : '<span class="btn-group"><button onClick="$(this).editUser(' +
                  user.id +
                  ')" class="btn btn-warning"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteUser(' +
                  user.id +
                  ')" class="btn btn-danger"><i class="fa fa-trash"></i></button></span>'
            }</td></tr>`;
        });

        $("#user_list").html(user_list);
        renderPagination(total, limit, page, "loadUserList", "#userList");
      });
    }

    function loadProductList(page = 1, query = "") {
      productListPage = page || 1;
      const limit = productListLimit;

      if (query == "" && $("#searchProductList").val() != "") {
        query = $("#searchProductList").val();
      }

      const categoryId = $("#productCategoryFilter").val() || "";
      let url =
        api +
        "inventory/products?page=" +
        productListPage +
        "&limit=" +
        limit;
      if (query != "") url += "&q=" + encodeURIComponent(query);
      if (categoryId) url += "&category_id=" + encodeURIComponent(categoryId);

      $.get(url, function (response) {
        let products = response.data || [];
        let total = response.total || 0;

        let product_list = "";
        $("#product_list").empty();

        if (!products.length) {
          $("#productListEmpty").show();
        } else {
          $("#productListEmpty").hide();
        }

        products.forEach((product) => {
          let category = allCategories.filter(function (cat) {
            return parseInt(cat.id) === parseInt(product.category_id);
          });

          product.stockAlert = "";
          let icon = "";
          const expiryDate = moment(product.expirationDate, DATE_FORMAT);

          const stockStatus = getStockStatus(
            product.quantity,
            product.minStock,
          );
          if (stockStatus <= 0) {
            if (stockStatus === 0) {
              product.stockStatus = "No Stock";
              icon = "fa fa-exclamation-triangle";
            }
            if (stockStatus === -1) {
              product.stockStatus = "Low Stock";
              icon = "fa fa-caret-down";
            }

            product.stockAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.stockStatus}</small></p>`;
          }
          product.expiryAlert = "";
          if (!isExpired(product.expirationDate)) {
            const diffDays = daysToExpire(product.expirationDate);

            if (diffDays > 0 && diffDays <= 30) {
              var days_noun = diffDays > 1 ? "days" : "day";
              icon = "fa fa-clock-o";
              product.expiryStatus = `${diffDays} ${days_noun} left`;
              product.expiryAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.expiryStatus}</small></p>`;
            }
          } else if (product.expirationDate) {
            icon = "fa fa-exclamation-triangle";
            product.expiryStatus = "Expired";
            product.expiryAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.expiryStatus}</small></p>`;
          }

          let safe_product_generic = DOMPurify.sanitize(
            String(product.generic || ""),
          );
          let safe_product_name = DOMPurify.sanitize(
            String(product.name || ""),
          );
          const priceDisplay = moneyFormat(
            parseFloat(product.price || 0).toFixed(2),
          );
          product_list += `<tr>
              <td>${product.generic && product.generic !== "undefined" ? safe_product_generic : safe_product_name}</td>
              <td>${safe_product_name}
              ${product.expiryAlert}</td>
              <td>${validator.unescape(settings.symbol)}${priceDisplay}</td>
              <td>${product.stock == 1 ? product.quantity : "N/A"}
              ${product.stockAlert}
              </td>
              <td>${product.expirationDate || ""}</td>
              <td>${category.length > 0 && category[0] ? DOMPurify.sanitize(String(category[0].name || "")) : ""}</td>
              <td class="nobr"><span class="btn-group"><button onClick="$(this).editProduct(${product.id})" class="btn btn-warning btn-sm"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteProduct(${
                product.id
              })" class="btn btn-danger btn-sm"><i class="fa fa-trash"></i></button></span></td></tr>`;
        });

        $("#product_list").html(product_list);
        Pagination.render({
          total,
          page: productListPage,
          limit,
          mount: "#productListPagination",
          namespace: "productList",
          showPageSize: true,
          onPageChange: function (nextPage) {
            loadProductList(nextPage, query);
          },
          onPageSizeChange: function (newLimit) {
            productListLimit = newLimit;
            loadProductList(1, query);
          },
        });
      });
    }

    function loadCategoryList(page = 1) {
      categoryListPage = page || 1;
      const limit = categoryListLimit;
      const query = ($("#searchCategoryList").val() || "").trim();
      let url =
        api +
        "categories/all?page=" +
        categoryListPage +
        "&limit=" +
        limit;
      if (query) url += "&q=" + encodeURIComponent(query);

      $.get(url, function (response) {
        let categories = response.data || [];
        let total = response.total || 0;

        let category_list = "";
        $("#category_list").empty();

        if (!categories.length) {
          $("#categoryListEmpty").show();
        } else {
          $("#categoryListEmpty").hide();
        }

        categories.forEach((category) => {
          const safeName = DOMPurify.sanitize(String(category.name || ""));
          category_list += `<tr>
            <td>${safeName}</td>
            <td><span class="btn-group"><button onClick="$(this).editCategory(${category.id})" class="btn btn-warning btn-sm"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteCategory(${
              category.id
            })" class="btn btn-danger btn-sm"><i class="fa fa-trash"></i></button></span></td></tr>`;
        });

        $("#category_list").html(category_list);
        Pagination.render({
          total,
          page: categoryListPage,
          limit,
          mount: "#categoryListPagination",
          namespace: "categoryList",
          showPageSize: true,
          onPageChange: function (nextPage) {
            loadCategoryList(nextPage);
          },
          onPageSizeChange: function (newLimit) {
            categoryListLimit = newLimit;
            loadCategoryList(1);
          },
        });
      });
    }

    $("#log-out").on("click", function () {
      const diagOptions = {
        title: "Are you sure?",
        text: "You are about to log out.",
        cancelButtonColor: "#3085d6",
        okButtonText: "Logout",
      };

      notiflix.Confirm.show(
        diagOptions.title,
        diagOptions.text,
        diagOptions.okButtonText,
        diagOptions.cancelButtonText,
        () => {
          $.get(api + "users/logout/" + user.id, function (data) {
            storage.delete("auth");
            storage.delete("user");
            storage.delete("token");
            ipcRenderer.send("app-reload", "");
          });
        },
      );
    });

    $("#settings_form").on("submit", function (e) {
      e.preventDefault();
      let formData = $(this).serializeObject();
      let mac_address;

      api = "http://" + host + ":" + port + "/api/";

      macaddress.one(function (err, mac) {
        mac_address = mac;
      });
      const appChoice = $("#app").find("option:selected").text();

      formData["app"] = appChoice;
      formData["mac"] = mac_address;
      formData["till"] = 1;

      let $appField = $("#settings_form input[name='app']");
      let $hiddenAppField = $("<input>", {
        type: "hidden",
        name: "app",
        value: formData.app,
      });
      $appField.length
        ? $appField.val(formData.app)
        : $("#settings_form").append(
            `<input type="hidden" name="app" value="${$hiddenAppField}" />`,
          );

      if (
        formData.percentage != "" &&
        typeof formData.percentage === "number"
      ) {
        notiflix.Report.warning(
          "Oops!",
          "Please make sure the tax value is a number",
          "Ok",
        );
      } else {
        storage.set("settings", formData);

        $(this).attr("action", api + "settings/post");
        $(this).attr("method", "POST");

        $(this).ajaxSubmit({
          contentType: "application/json",
          success: function () {
            ipcRenderer.send("app-reload", "");
          },
          error: function (jqXHR) {
            console.error(jqXHR.responseJSON.message);
            notiflix.Report.failure(
              jqXHR.responseJSON.error,
              jqXHR.responseJSON.message,
              "Ok",
            );
          },
        });
      }
    });

    $("#net_settings_form").on("submit", function (e) {
      e.preventDefault();
      let formData = $(this).serializeObject();

      if (formData.till == 0 || formData.till == 1) {
        notiflix.Report.warning(
          "Oops!",
          "Please enter a number greater than 1.",
          "Ok",
        );
      } else {
        if (isNumeric(formData.till)) {
          formData["app"] = $("#app").find("option:selected").text();
          storage.set("settings", formData);
          ipcRenderer.send("app-reload", "");
        } else {
          notiflix.Report.warning(
            "Oops!",
            "Till number must be a number!",
            "Ok",
          );
        }
      }
    });

    $("#saveUser").on("submit", function (e) {
      e.preventDefault();
      let formData = $(this).serializeObject();

      // Only enforce the match check when a new password was actually typed.
      // (An existing-user edit with an empty password field means "leave the
      // password untouched", which is handled server-side in api/users.js.)
      if (formData.password) {
        if (formData.password != formData.pass) {
          notiflix.Report.warning("Oops!", "Passwords do not match!", "Ok");
          return;
        }
      }

      $.ajax({
        url: api + "users/post",
        type: "POST",
        data: JSON.stringify(formData),
        contentType: "application/json; charset=utf-8",
        cache: false,
        processData: false,
        success: function (data) {
          if (ownUserEdit) {
            ipcRenderer.send("app-reload", "");
          } else {
            $("#userModal").modal("hide");

            loadUserList();

            $("#Users").modal("show");
            notiflix.Report.success("Great!", "User details saved!", "Ok");
          }
        },
        error: function (jqXHR, textStatus, errorThrown) {
          notiflix.Report.failure(
            jqXHR.responseJSON.error,
            jqXHR.responseJSON.message,
            "Ok",
          );
        },
      });
    });

    $("#app").on("change", function () {
      if (
        $(this).find("option:selected").text() ==
        "Network Point of Sale Terminal"
      ) {
        $("#net_settings_form").show(500);
        $("#settings_form").hide(500);
        macaddress.one(function (err, mac) {
          $("#mac").val(mac);
        });
      } else {
        $("#net_settings_form").hide(500);
        $("#settings_form").show(500);
      }
    });

    $("#cashier").on("click", function () {
      ownUserEdit = true;

      $("#userModal").modal("show");

      $("#user_id").val(user.id);
      $("#fullname").val(user.fullname);
      $("#username").val(user.username);
      $("#password").attr("placeholder", "New Password");

      for (perm of permissions) {
        var el = "#" + perm;
        if (allUsers[index][perm] == 1) {
          $(el).prop("checked", true);
        } else {
          $(el).prop("checked", false);
        }
      }
    });

    $("#add-user").on("click", function () {
      if (platform.app != "Network Point of Sale Terminal") {
        $(".perms").show();
      }

      $("#saveUser").get(0).reset();
      $("#userModal").modal("show");
    });

    $("#settings").on("click", function () {
      if (platform.app == "Network Point of Sale Terminal") {
        $("#net_settings_form").show(500);
        $("#settings_form").hide(500);

        $("#ip").val(platform.ip);
        $("#till").val(platform.till);

        macaddress.one(function (err, mac) {
          $("#mac").val(mac);
        });

        $("#app option")
          .filter(function () {
            return $(this).text() == platform.app;
          })
          .prop("selected", true);
      } else {
        $("#net_settings_form").hide(500);
        $("#settings_form").show(500);

        $("#settings_id").val("1");
        $("#store").val(validator.unescape(settings.store));
        $("#address_one").val(validator.unescape(settings.address_one));
        $("#address_two").val(validator.unescape(settings.address_two));
        $("#contact").val(validator.unescape(settings.contact));
        $("#tax").val(validator.unescape(settings.tax));
        $("#symbol").val(validator.unescape(settings.symbol));
        $("#percentage").val(validator.unescape(settings.percentage));
        $("#footer").val(validator.unescape(settings.footer));
        $("#logo_img").val(validator.unescape(settings.img));
        if (settings.charge_tax) {
          $("#charge_tax").prop("checked", true);
        }
        if (validator.unescape(settings.img) != "") {
          $("#logoname").hide();
          $("#current_logo").html(
            `<img src="${img_path + validator.unescape(settings.img)}" alt="">`,
          );
          $("#rmv_logo").show();
        }

        $("#app option")
          .filter(function () {
            return $(this).text() == validator.unescape(settings.app);
          })
          .prop("selected", true);
      }
    });
  });

  $("#rmv_logo").on("click", function () {
    $("#remove_logo").val("1");
    $("#current_logo").hide(500);
    $(this).hide(500);
    $("#logoname").show(500);
  });

  $("#rmv_img").on("click", function () {
    $("#remove_img").val("1");
    $("#current_img").hide(500);
    $(this).hide(500);
    $("#imagename").show(500);
  });
}

$.fn.print = function () {
  printJS({ printable: receipt, type: "raw-html" });
};

function loadTransactions() {
  let tills = [];
  let users = [];
  let sales = 0;
  let transact = 0;
  let unique = 0;

  sold_items = [];
  sold = [];

  let counter = 0;
  let transaction_list = "";
  let query = `by-date?start=${start_date}&end=${end_date}&user=${by_user}&status=${by_status}&till=${by_till}`;

  $.get(api + query, function (transactions) {
    if (!settings) {
      console.warn("Settings not loaded, cannot render transaction list.");
      return;
    }
    if (transactions && transactions.length > 0) {
      $("#transaction_list").empty();
      if ($.fn.DataTable.isDataTable("#transactionList")) {
        $("#transactionList").DataTable().destroy();
      }

      allTransactions = [...transactions];

      transactions.forEach((trans, index) => {
        sales += parseFloat(trans.total);
        transact++;

        if (trans.items && Array.isArray(trans.items)) {
          trans.items.forEach((item) => {
            if (item) sold_items.push(item);
          });
        }

        if (!tills.includes(trans.till)) {
          tills.push(trans.till);
        }

        if (!users.includes(trans.user_id)) {
          users.push(trans.user_id);
        }

        counter++;
        transaction_list += `<tr>
                                <td>${trans.id}</td>
                                <td class="nobr">${moment(trans.date).format(
                                  "DD-MMM-YYYY HH:mm:ss",
                                )}</td>
                                <td>${
                                  validator.unescape(String(settings.symbol)) +
                                  moneyFormat(trans.total)
                                }</td>
                                <td>${
                                  trans.paid == ""
                                    ? ""
                                    : validator.unescape(
                                        String(settings.symbol),
                                      ) + moneyFormat(trans.paid)
                                }</td>
                                <td>${
                                  trans.change
                                    ? validator.unescape(
                                        String(settings.symbol),
                                      ) +
                                      moneyFormat(
                                        Math.abs(trans.change).toFixed(2),
                                      )
                                    : ""
                                }</td>
                                <td>${
                                  trans.paid == ""
                                    ? ""
                                    : trans.payment_type || "Cash"
                                }</td>
                                <td>${
                                  trans.paid == ""
                                    ? '<button class="btn btn-dark"><i class="fa fa-search-plus"></i></button>'
                                    : '<button onClick="$(this).viewTransaction(' +
                                      index +
                                      ')" class="btn btn-info"><i class="fa fa-search-plus"></i></button></td>'
                                }</tr>
                    `;

        if (counter == transactions.length) {
          $("#total_sales #counter").text(
            validator.unescape(String(settings.symbol)) +
              moneyFormat(parseFloat(sales).toFixed(2)),
          );
          $("#total_transactions #counter").text(transact);

          const result = {};

          for (const item of sold_items) {
            if (item && item.product_name) {
              const { product_name, price, quantity, id } = item;
              if (!result[product_name]) result[product_name] = [];
              result[product_name].push({
                id: id || 0,
                price: price || 0,
                quantity: quantity || 0,
              });
            }
          }

          for (item in result) {
            let price = 0;
            let quantity = 0;
            let id = 0;

            result[item].forEach((i) => {
              id = i.id;
              price = i.price || 0;
              quantity = quantity + (parseInt(i.quantity) || 0);
            });

            sold.push({
              id: id,
              product: item,
              qty: quantity,
              price: price,
            });
          }

          $("#transaction_list").html(transaction_list);
          if ($.fn.DataTable.isDataTable("#transactionList")) {
            $("#transactionList").DataTable().destroy();
          }
          $("#transactionList").DataTable({
            order: [[1, "desc"]],
            autoWidth: false,
            info: true,
            JQueryUI: true,
            ordering: true,
            paging: true,
            dom: "Bfrtip",
            buttons: ["csv", "excel", "pdf"],
          });

          loadSoldProducts();
        }
      });
    } else {
      $("#transaction_list").empty();
      $("#total_sales #counter").text(
        validator.unescape(String(settings.symbol)) + "0.00",
      );
      $("#total_transactions #counter").text(0);
      $("#total_items #counter").text(0);
      $("#total_products #counter").text(0);
      notiflix.Report.warning(
        "No data!",
        "No transactions available within the selected criteria",
        "Ok",
      );
    }
  });
}

function sortDesc(a, b) {
  if (a.qty > b.qty) {
    return -1;
  }
  if (a.qty < b.qty) {
    return 1;
  }
  return 0;
}

function loadSoldProducts() {
  sold.sort(sortDesc);

  let counter = 0;
  let sold_list = "";
  let items = 0;
  let products = 0;
  $("#product_sales").empty();

  sold.forEach((item, index) => {
    items = items + parseInt(item.qty);
    products++;

    let product = allProducts.filter(function (selected) {
      return selected.id == item.id;
    });

    counter++;

    let stockStatus = "N/A";
    if (product && product.length > 0) {
      stockStatus = product[0].stock == 1 ? product[0].quantity || 0 : "N/A";
    }

    sold_list += `<tr>
            <td>${item.product}</td>
            <td>${item.qty}</td>
            <td>${stockStatus}</td>
            <td>${
              validator.unescape(settings.symbol) +
              moneyFormat((item.qty * parseFloat(item.price)).toFixed(2))
            }</td>
            </tr>`;

    if (counter == sold.length) {
      $("#total_items #counter").text(items);
      $("#total_products #counter").text(products);
      $("#product_sales").html(sold_list);
    }
  });
}

function userFilter(users) {
  $("#users").empty();
  $("#users").append(`<option value="0">All</option>`);

  users.forEach((user) => {
    let u = allUsers.filter(function (usr) {
      return usr.id == user;
    });

    $("#users").append(`<option value="${user}">${u[0].fullname}</option>`);
  });
}

function tillFilter(tills) {
  $("#tills").empty();
  $("#tills").append(`<option value="0">All</option>`);
  tills.forEach((till) => {
    $("#tills").append(`<option value="${till}">${till}</option>`);
  });
}

$.fn.viewTransaction = function (index) {
  transaction_index = index;
  const txn = allTransactions[index];
  if (!txn) return;

  const discount = parseFloat(txn.discount) || 0;
  const taxAmount = parseFloat(txn.tax) || 0;
  const total = parseFloat(txn.total) || 0;
  const subtotal = total - taxAmount + discount;
  const products = Array.isArray(txn.items) ? txn.items : [];
  const refNumber =
    txn.ref_number && String(txn.ref_number).trim() !== ""
      ? txn.ref_number
      : txn.id;
  const customerName =
    txn.hold_customer_name ||
    (txn.customer && txn.customer.name) ||
    "Walk-in Customer";
  const cashierUser = allUsers.find((u) => u.id == txn.user_id);
  const logo = path.join(img_path, safeLogoFilename(String(settings.img || "")));
  const logoPath = checkFileExists(logo) ? logo : "";
  const isVoided = txn.status === -1 || txn.status === "-1";

  receipt = buildReceipt({
    settings,
    logoPath,
    orderNumber: txn.id,
    date: moment(txn.date).format("DD MMM YYYY HH:mm"),
    cashier: (cashierUser && cashierUser.fullname) || txn.user || "Cashier",
    refNumber,
    customerName,
    items: products,
    subtotal,
    discount,
    taxAmount,
    total,
    paid: txn.paid,
    change: txn.change,
    paymentMethod: txn.payment_type || "Cash",
    statusLabel: isVoided ? "VOIDED" : txn.status === 0 ? "HOLD / UNPAID" : "",
  });

  $("#viewTransaction").html("");
  $("#viewTransaction").html(receipt);

  const canVoid =
    user && user.perm_transactions === 1 && txn && !isVoided;
  if (canVoid) {
    $("#voidTransactionBtn").show();
  } else {
    $("#voidTransactionBtn").hide();
  }

  $("#orderModal").modal("show");
};

$.fn.voidCurrentTransaction = function () {
  const txn = allTransactions[transaction_index];
  if (!txn || txn.status === -1 || txn.status === "-1") {
    return;
  }
  if (!user || user.perm_transactions !== 1) {
    notiflix.Report.failure(
      "Forbidden",
      "You do not have permission to void sales.",
      "Ok",
    );
    return;
  }

  notiflix.Confirm.show(
    "Void sale?",
    "This will void the sale and restore stock. This cannot be undone.",
    "Yes, void it",
    "Cancel",
    () => {
      $.ajax({
        url: api + "void/" + txn.id,
        type: "POST",
        contentType: "application/json; charset=utf-8",
        cache: false,
        success: function () {
          $("#orderModal").modal("hide");
          $("#voidTransactionBtn").hide();
          notiflix.Report.success(
            "Voided",
            "Sale voided and stock restored.",
            "Ok",
          );
          if (typeof loadTransactions === "function") {
            loadTransactions();
          }
          if (typeof loadProducts === "function") {
            loadProducts();
          }
        },
        error: function (xhr) {
          let message = "Could not void the sale.";
          if (xhr.responseJSON && xhr.responseJSON.message) {
            message = xhr.responseJSON.message;
          }
          notiflix.Report.failure("Void failed", message, "Ok");
        },
      });
    },
  );
};

$("#status").on("change", function () {
  by_status = $(this).find("option:selected").val();
  loadTransactions();
});

$("#tills").on("change", function () {
  by_till = $(this).find("option:selected").val();
  loadTransactions();
});

$("#users").on("change", function () {
  by_user = $(this).find("option:selected").val();
  loadTransactions();
});

$("#reportrange").on("apply.daterangepicker", function (ev, picker) {
  start = picker.startDate.format("DD MMM YYYY hh:mm A");
  end = picker.endDate.format("DD MMM YYYY hh:mm A");

  start_date = picker.startDate.toDate().toJSON();
  end_date = picker.endDate.toDate().toJSON();

  loadTransactions();
});

function loadOutOfStock(page = 1) {
  let limit = 10;
  let query = $("#outOfStockSearch").val() || "";
  let typeFilter = $("#outOfStockTypeFilter").val() || "";
  let sort = $("#outOfStockSort").val() || "lowest_first";

  let url = api + "out-of-stock?page=" + page + "&limit=" + limit;
  if (query !== "") url += "&q=" + encodeURIComponent(query);
  if (typeFilter !== "") url += "&type=" + encodeURIComponent(typeFilter);
  if (sort !== "") url += "&sort=" + encodeURIComponent(sort);

  $.get(url, function (response) {
    let data = response.data;
    let total = response.total;

    $("#outOfStockTableBody").empty();

    if (data.length === 0) {
      $("#outOfStockTable").hide();
      $("#outOfStockEmptyMessage").show();
      $("#outOfStockPagination").hide();
    } else {
      $("#outOfStockTable").show();
      $("#outOfStockEmptyMessage").hide();
      $("#outOfStockPagination").show();

      data.forEach((item) => {
        let isCritical = item.current_quantity === 0;
        let rowClass = isCritical ? "bg-danger" : "";
        let safe_product_name = DOMPurify.sanitize(String(item.product_name || ""));
        let safe_strength = DOMPurify.sanitize(String(item.strength || ""));
        let safe_type = DOMPurify.sanitize(String(item.type || ""));

        let row = `<tr class="${rowClass}">
              <td>${safe_product_name}</td>
              <td>${item.strength ? safe_strength : "N/A"}</td>
              <td>${item.type ? safe_type : "N/A"}</td>
              <td>
                <input type="number" min="0" class="form-control text-center out-of-stock-reorder" 
                  data-id="${item.id}" value="${item.reorder_quantity || ""}" placeholder="Qty">
              </td>
              <td>
                <button class="btn btn-primary btn-sm save-reorder-btn" data-id="${item.id}">
                    <i class="fa fa-save"></i> Save
                </button>
              </td>
          </tr>`;
        $("#outOfStockTableBody").append(row);
      });

      renderOutOfStockPagination(total, limit, page);
    }
  }).fail(function () {
    notiflix.Notify.failure("Failed to fetch Out of Stock products");
  });
}

function renderOutOfStockPagination(total, limit, page) {
  let pages = Math.ceil(total / limit);
  let html = "";

  if (pages > 1) {
    let prev = page - 1;
    let next = page + 1;
    let disabledPrev = page == 1 ? "disabled" : "";
    let disabledNext = page >= pages ? "disabled" : "";

    html += `<li class="${disabledPrev}"><a href="#" class="oos-pagination-btn" data-page="${prev}">Previous</a></li>`;
    html += `<li class="active"><a href="#">Page ${page} of ${pages}</a></li>`;
    html += `<li class="${disabledNext}"><a href="#" class="oos-pagination-btn" data-page="${next}">Next</a></li>`;
  }

  $("#outOfStockPagination").html(html);
}

$(document).on("click", ".oos-pagination-btn", function (e) {
  e.preventDefault();
  if ($(this).parent().hasClass("disabled")) return;
  let page = $(this).data("page");
  loadOutOfStock(page);
});

let oosSearchTimeout;
$("#outOfStockSearch").on("input", function () {
  clearTimeout(oosSearchTimeout);
  oosSearchTimeout = setTimeout(() => {
    loadOutOfStock(1);
  }, 300);
});

$("#outOfStockTypeFilter, #outOfStockSort"). on("change", function () {
  loadOutOfStock(1);
});

$("#exportOosCsv, #exportOosPdf").on("click", function (e) {
  e.preventDefault();
  let format = $(this).attr("id") === "exportOosCsv" ? "csv" : "pdf";
  let query = $("#outOfStockSearch").val() || "";
  let typeFilter = $("#outOfStockTypeFilter").val() || "";
  let sort = $("#outOfStockSort").val() || "lowest_first";

  let url = api + "out-of-stock?page=1&limit=10000";
  if (query !== "") url += "&q=" + encodeURIComponent(query);
  if (typeFilter !== "") url += "&type=" + encodeURIComponent(typeFilter);
  if (sort !== "") url += "&sort=" + encodeURIComponent(sort);

  let btn = $(this);
  let originalHtml = btn.html();
  btn.html('<i class="fa fa-spinner fa-spin"></i>');
  btn.prop("disabled", true);

  $.get(url, function (response) {
    btn.html(originalHtml);
    btn.prop("disabled", false);

    let data = response.data;
    if (data.length === 0) {
      notiflix.Notify.warning("No data to export");
      return;
    }

    let tempTableId = "tempExportTable_" + Date.now();
    let tempTable = $(`<table id="${tempTableId}">
        <thead><tr><th>Product Name</th><th>Strength</th><th>Type</th><th>Reorder Quantity</th></tr></thead>
        <tbody></tbody>
      </table>`);

    data.forEach((item) => {
      let safe_product_name = DOMPurify.sanitize(String(item.product_name || ""));
      let safe_strength = DOMPurify.sanitize(String(item.strength || "N/A"));
      let safe_type = DOMPurify.sanitize(String(item.type || "N/A"));
      tempTable.find("tbody").append(`<tr>
          <td>${safe_product_name}</td>
          <td>${safe_strength}</td>
          <td>${safe_type}</td>
          <td>${item.reorder_quantity || ""}</td>
        </tr>`);
    });

    $("body").append(tempTable);
    tempTable.hide();

    let dt = tempTable.DataTable({
      dom: "Bfrtip",
      buttons: [
        { extend: "csv", title: "Out_of_Stock_Products" },
        { extend: "pdf", title: "Out_of_Stock_Products" },
      ],
    });

    if (format === "csv") {
      dt.button(".buttons-csv").trigger();
    } else {
      dt.button(".buttons-pdf").trigger();
    }

    setTimeout(() => {
      dt.destroy();
      tempTable.remove();
    }, 1000);
  }).fail(function () {
    btn.html(originalHtml);
    btn.prop("disabled", false);
    notiflix.Notify.failure("Failed to fetch data for export");
  });
});

$(document).on("click", ".save-reorder-btn", function () {
  let id = $(this).data("id");
  let inputField = $(this).closest("tr").find(".out-of-stock-reorder");
  let reorderValue = inputField.val();

  let btn = $(this);
  let originalHtml = btn.html();
  btn.html('<i class="fa fa-spinner fa-spin"></i>');
  btn.prop("disabled", true);

  $.ajax({
    url: api + "out-of-stock/" + id,
    type: "PUT",
    data: JSON.stringify({ reorder_quantity: reorderValue }),
    contentType: "application/json; charset=utf-8",
    success: function () {
      notiflix.Notify.success("Reorder quantity saved!");
      btn.html(originalHtml);
      btn.prop("disabled", false);
    },
    error: function () {
      notiflix.Notify.failure("Failed to save reorder quantity.");
      btn.html(originalHtml);
      btn.prop("disabled", false);
    },
  });
});

function authenticate() {
  $(".loading").hide();
  $("body").attr("class", "login-page");
  $("#login").show();
}

$("body").on("submit", "#account", function (e) {
  e.preventDefault();
  let formData = $(this).serializeObject();

  if (formData.username == "" || formData.password == "") {
    notiflix.Report.warning("Incomplete form!", auth_empty, "Ok");
  } else {
    $.ajax({
      url: api + "users/login",
      type: "POST",
      data: JSON.stringify(formData),
      contentType: "application/json; charset=utf-8",
      cache: false,
      processData: false,
      success: function (data) {
        if (data.auth === true) {
          storage.set("auth", { auth: true });
          storage.set("user", data.user);
          storage.set("token", data.token);
          $.ajaxSetup({ headers: { "X-Access-Token": data.token } });
          if (data.user && data.user.must_change_password) {
            notiflix.Report.warning(
              "Password Change Required",
              "Please change your password immediately from your profile/settings.",
              "Ok",
            );
          }
          ipcRenderer.send("app-reload", "");
          $("#login").hide();
        } else {
          notiflix.Report.warning("Oops!", auth_error, "Ok");
        }
      },
    });
  }
});

$("#quit").on("click", function () {
  const diagOptions = {
    title: "Are you sure?",
    text: "You are about to close the application.",
    icon: "warning",
    okButtonText: "Close Application",
    cancelButtonText: "Cancel",
  };

  notiflix.Confirm.show(
    diagOptions.title,
    diagOptions.text,
    diagOptions.okButtonText,
    diagOptions.cancelButtonText,
    () => {
      ipcRenderer.send("app-quit", "");
    },
  );
});

ipcRenderer.on("click-element", (event, elementId) => {
  document.getElementById(elementId).click();
});
