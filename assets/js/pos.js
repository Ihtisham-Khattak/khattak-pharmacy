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
let paymentType = 0;
let receipt = "";
let totalVat = 0;
let subTotal = 0;
let method = "";
let order_index = 0;
let user_index = 0;
let product_index = 0;
let transaction_index;
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
let host = "localhost";
let port = process.env.PORT;
let img_path = path.join(appData, appName, "uploads", "/");
let api = "http://" + host + ":" + port + "/api/";
const bcrypt = require("bcrypt");
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
notiflix.Notify.init({
  position: "right-top",
  timeout: 5000,
  cssAnimationDuration: 400,
  messageMaxLength: 150,
  clickToClose: true,
  closeButton: true,
  useIcon: true,
  showOnlyTheLastOne: true,
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

//set the content security policy of the app
setContentSecurityPolicy();

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

  function renderPagination(total, limit, page, type, container) {
    let pages = Math.ceil(total / limit);
    let html =
      '<div class="row"><div class="col-md-12"><div class="text-center"><ul class="pagination pagination-sm">';
    let prev = page - 1;
    let next = page + 1;
    let disabledPrev = page == 1 ? "disabled" : "";
    let disabledNext = page >= pages ? "disabled" : "";

    if (pages > 1) {
      html += `<li class="${disabledPrev}"><a href="#" class="pagination-btn" data-func="${type}" data-page="${prev}">Previous</a></li>`;
      html += `<li class="active"><a href="#">Page ${page} of ${pages}</a></li>`;
      html += `<li class="${disabledNext}"><a href="#" class="pagination-btn" data-func="${type}" data-page="${next}">Next</a></li>`;
    }

    html += "</ul></div></div></div>";

    $(container).parent().find(".pagination-container").remove();
    $(container)
      .parent()
      .append(`<div class="pagination-container">${html}</div>`);
  }

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
      perms = true;
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
    // CUSTOMER DROPDOWN - COMMENTED OUT
    // loadCustomers();

    // Pagination Click Handler
    $(document).on("click", ".pagination-btn", function (e) {
      e.preventDefault();
      let func = $(this).data("func");
      let page = $(this).data("page");
      if (func === "loadProducts") loadProducts(page);
      else if (func === "loadProductList") loadProductList(page);
      else if (func === "loadCategoryList") loadCategoryList(page);
      else if (func === "loadUserList") loadUserList(page);
    });

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
        loadProductList(1, query);
      }, 300);
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

        // data.forEach((item) => {
        //   item.price = parseFloat(item.price).toFixed(2);
        // });

        allProducts = [...data];

        // loadProductList(); // Don't reload list view every time

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
          if (!categories.includes(item.category)) {
            categories.push(item.category);
          }

          let item_isExpired = isExpired(item.expirationDate);
          let item_stockStatus = getStockStatus(item.quantity, item.minStock);

          let row = `<tr>
              <td>${item.generic && item.generic !== "undefined" ? item.generic : item.name}</td>
              <td><span class="${item_isExpired ? "text-danger" : ""}">${item.name}</span> <br><small class="sku">${item.id}</small></td>
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
        loadCategoryList();
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
      total = total - $("#inputDiscount").val();
      $("#price").text(
        validator.unescape(settings.symbol) + moneyFormat(total.toFixed(2)),
      );

      subTotal = total;

      if ($("#inputDiscount").val() >= total) {
        $("#inputDiscount").val(0);
      }

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
          $("<div>", { class: "row m-t-10 align-items-center" }).append(
            $("<div>", { class: "col-xs-1", text: index + 1 }),
            $("<div>", { class: "col-xs-4", text: data.product_name }),
            $("<div>", { class: "col-xs-3" }).append(
              $("<div>", { class: "input-group input-group-sm" }).append(
                $("<span>", { class: "input-group-btn" }).append(
                  $("<button>", {
                    class: "btn btn-light",
                    onclick: "$(this).qtDecrement(" + index + ")",
                  }).append($("i", { class: "fa fa-minus" })),
                ),
                $("<input>", {
                  class: "num-qty form-control text-center",
                  type: "text",
                  readonly: "",
                  value: data.quantity,
                  min: "1",
                  onInput: "$(this).qtInput(" + index + ")",
                }),
                $("<span>", { class: "input-group-btn" }).append(
                  $("<button>", {
                    class: "btn btn-light",
                    onclick: "$(this).qtIncrement(" + index + ")",
                  }).append($("i", { class: "fa fa-plus" })),
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
                onclick: "$(this).deleteFromCart(" + index + ")",
              }).append($("i", { class: "fa fa-times" })),
            ),
          ),
        );
      });
    };

    $.fn.deleteFromCart = function (index) {
      cart.splice(index, 1);
      $(this).renderTable(cart);
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
      if (item.quantity > 1) {
        item = cart[i];
        item.quantity = parseInt(item.quantity) - 1;
        $(this).renderTable(cart);
      }
    };

    $.fn.qtInput = function (i) {
      item = cart[i];
      item.quantity = $(this).val();
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
            $(this).renderTable(cart);
            holdOrder = 0;
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
        $("#dueModal").modal("toggle");
      } else {
        notiflix.Report.warning("Oops!", "There is nothing to hold!", "Ok");
      }
    });

    function printJobComplete() {
      notiflix.Report.success("Done", "print job complete", "Ok");
    }

    $.fn.submitDueOrder = function (status) {
      try {
        if (!settings || !platform) {
          console.error("Settings or Platform data missing");
          notiflix.Report.failure(
            "Missing Configuration",
            "Application settings are not loaded. Please refresh the page.",
            "Ok",
          );
          return;
        }

        let items = "";
        let payment = 0;
        let p_type = $(".list-group-item.active").data("payment-type") || 1; // Fallback to 1 (Cash)

        cart.forEach((item) => {
          items += `<tr><td>${DOMPurify.sanitize(item.product_name)}</td><td>${DOMPurify.sanitize(
            item.quantity,
          )} </td><td class="text-right"> ${DOMPurify.sanitize(validator.unescape(String(settings.symbol || "$")))} ${moneyFormat(
            DOMPurify.sanitize(Math.abs(item.price).toFixed(2)),
          )} </td></tr>`;
        });

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
        let tax_row = "";

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

        if (paid != "") {
          payment = `<tr>
                          <td>Paid</td>
                          <td>:</td>
                          <td class="text-right">${validator.unescape(String(settings.symbol || "$"))} ${moneyFormat(
                            Math.abs(paid).toFixed(2),
                          )}</td>
                      </tr>
                      <tr>
                          <td>Change</td>
                          <td>:</td>
                          <td class="text-right">${validator.unescape(String(settings.symbol || "$"))} ${moneyFormat(
                            Math.abs(change).toFixed(2),
                          )}</td>
                      </tr>
                      <tr>
                          <td>Method</td>
                          <td>:</td>
                          <td class="text-right">${type}</td>
                      </tr>`;
        }

        if (settings.charge_tax) {
          tax_row = `<tr>
                      <td>VAT(${validator.unescape(String(settings.percentage || "0"))})% </td>
                      <td>:</td>
                      <td class="text-right">${validator.unescape(String(settings.symbol || "$"))} ${moneyFormat(
                        parseFloat(totalVat || 0).toFixed(2),
                      )}</td>
                  </tr>`;
        }

        if (status == 0) {
          if ($("#refNumber").val() == "") {
            notiflix.Report.warning(
              "Reference Required!",
              "You need to enter a reference for hold orders!",
              "Ok",
            );
            return;
          }
        }

        $(".loading").show();

        if (holdOrder != 0) {
          orderNumber = holdOrder;
          method = "PUT";
        } else {
          orderNumber = Math.floor(Date.now() / 1000);
          method = "POST";
        }

        let logo = settings.img
          ? path.join(img_path, validator.unescape(String(settings.img)))
          : "";

        receipt = `<div style="font-family: 'Helvetica Neue', sans-serif; font-size: 12px; width: 100%; color: #333;">
          <div style="text-align: center; margin-bottom: 10px;">
              ${
                logo && checkFileExists(logo)
                  ? `<img style='max-width: 80px; margin-bottom: 5px;' src='${logo}' /><br>`
                  : ``
              }
              <h3 style="margin: 0; font-size: 18px; font-weight: bold;">${validator.unescape(String(settings.store || "PharmaSpot"))}</h3>
              <p style="margin: 2px 0;">${validator.unescape(String(settings.address_one || ""))}</p>
              <p style="margin: 2px 0;">${validator.unescape(String(settings.address_two || ""))}</p>
              <p style="margin: 2px 0;">${
                validator.unescape(String(settings.contact || "")) != ""
                  ? "Tel: " + validator.unescape(String(settings.contact))
                  : ""
              }</p>
              <p style="margin: 2px 0;">${
                validator.unescape(String(settings.tax || "")) != ""
                  ? "Vat No: " + validator.unescape(String(settings.tax))
                  : ""
              }</p>
          </div>
          
          <div style="border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; padding: 5px 0; margin-bottom: 10px;">
              <table style="width: 100%; font-size: 11px;">
                  <tr>
                      <td><strong>Order:</strong> ${orderNumber}</td>
                      <td style="text-align: right;"><strong>Date:</strong> ${date}</td>
                  </tr>
                  <tr>
                      <td><strong>Cashier:</strong> ${user.fullname || "User"}</td>
                      <td style="text-align: right;"><strong>Ref:</strong> ${refNumber == "" ? orderNumber : _.escape(refNumber)}</td>
                  </tr>
                  <tr>
                      <td colspan="2"><strong>Customer:</strong> ${
                        customer == 0
                          ? "Walk in customer"
                          : _.escape(customer.name)
                      }</td>
                  </tr>
              </table>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
              <thead>
                  <tr style="border-bottom: 1px solid #000;">
                      <th style="text-align: left; padding: 5px 0;">Item</th>
                      <th style="text-align: center; padding: 5px 0;">Qty</th>
                      <th style="text-align: right; padding: 5px 0;">Price</th>
                  </tr>
              </thead>
              <tbody>
                  ${items}
              </tbody>
          </table>

          <div style="border-top: 1px solid #000; padding-top: 5px;">
              <table style="width: 100%; font-size: 12px;">
                  <tr>
                      <td style="padding-top: 5px;">Subtotal:</td>
                      <td style="text-align: right; padding-top: 5px;">${validator.unescape(String(settings.symbol || "$"))}${moneyFormat((subTotal || 0).toFixed(2))}</td>
                  </tr>
                  ${
                    discount > 0
                      ? `<tr>
                          <td>Discount:</td>
                          <td style="text-align: right;">${validator.unescape(String(settings.symbol || "$")) + moneyFormat(parseFloat(discount).toFixed(2))}</td>
                         </tr>`
                      : ""
                  }
                  ${tax_row ? tax_row.replace(/<tr>/g, '<tr style="font-size: 11px; color: #666;">') : ""}
                  <tr style="font-weight: bold; font-size: 14px;">
                      <td style="padding-top: 5px; border-top: 1px dashed #ccc;">Total:</td>
                      <td style="text-align: right; padding-top: 5px; border-top: 1px dashed #ccc;">${validator.unescape(String(settings.symbol || "$"))}${moneyFormat(parseFloat(orderTotal || 0).toFixed(2))}</td>
                  </tr>
                   ${
                     payment != 0
                       ? `<tr>
                          <td style="padding-top: 5px;">Paid:</td>
                          <td style="text-align: right; padding-top: 5px;">${payment
                            .replace(/<td class="text-right">/g, "")
                            .replace(/<\/td>/g, "")
                            .replace(/<td>/g, "")
                            .replace(/<b>/g, "")
                            .replace(/<\/b>/g, "")}</td> 
                         </tr>`
                       : ""
                   }
                   ${
                     change > 0
                       ? `<tr>
                          <td>Change:</td>
                          <td style="text-align: right;">${validator.unescape(String(settings.symbol || "$"))}${moneyFormat(parseFloat(change).toFixed(2))}</td>
                         </tr>`
                       : ""
                   }
              </table>
          </div>

          <div style="text-align: center; margin-top: 15px; font-size: 11px; color: #666;">
              <p>${validator.unescape(String(settings.footer || "Thank you!"))}</p>
              <p>Thank you for purchasing!</p>
              <p>For inquiries, contact: ${validator.unescape(String(settings.contact || ""))}</p>
          </div>
        </div>`;

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
            receipt = DOMPurify.sanitize(receipt, {
              ALLOW_UNKNOWN_PROTOCOLS: true,
            });
            $("#viewTransaction").html("");
            $("#viewTransaction").html(receipt);
            $("#orderModal").modal("show");
            loadProducts();
            $(".loading").hide();
            $("#dueModal").modal("hide");
            $("#paymentModel").modal("hide");
            $.fn.getHoldOrders();
            $.fn.getCustomerOrders();
            $.fn.renderTable(cart);
          },

          error: function (data) {
            $(".loading").hide();
            $("#dueModal").modal("toggle");
            notiflix.Report.failure(
              "Something went wrong!",
              "Please refresh this page and try again",
              "Ok",
            );
          },
        });

        $("#refNumber").val("");
        $("#change").text("");
        $("#payment,#paymentText").val("");
      } catch (err) {
        console.error("Critical error in submitDueOrder:", err);
        $(".loading").hide();
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
        $.fn.calculatePrice(order);
        renderLocation.append(
          $("<div>", {
            class:
              orderType == 1 ? "col-md-3 order" : "col-md-3 customer-order",
          }).append(
            $("<a>").append(
              $("<div>", { class: "card-box order-box" }).append(
                $("<p>").append(
                  $("<b>", { text: "Ref :" }),
                  $("<span>", { text: order.ref_number, class: "ref_number" }),
                  $("<br>"),
                  $("<b>", { text: "Price :" }),
                  $("<span>", {
                    text: order.total,
                    class: "label label-info",
                    style: "font-size:14px;",
                  }),
                  $("<br>"),
                  $("<b>", { text: "Items :" }),
                  $("<span>", { text: order.items.length }),
                  $("<br>"),
                  $("<b>", { text: "Customer :" }),
                  $("<span>", {
                    text:
                      order.customer != 0
                        ? order.customer.name
                        : "Walk in customer",
                    class: "customer_name",
                  }),
                ),
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

      let vat = (price * data.vat) / 100;
      totalPrice = (price + vat - data.discount).toFixed(0);

      return totalPrice;
    };

    $.fn.orderDetails = function (index, orderType) {
      $("#refNumber").val("");

      if (orderType == 1) {
        $("#refNumber").val(holdOrderList[index].ref_number);

        // CUSTOMER DROPDOWN - COMMENTED OUT
        // $("#customer option:selected").removeAttr("selected");

        // $("#customer option")
        //   .filter(function () {
        //     return $(this).text() == "Walk in customer";
        //   })
        //   .prop("selected", true);

        holdOrder = holdOrderList[index].id;
        cart = [];
        $.each(holdOrderList[index].items, function (index, product) {
          item = {
            id: product.id,
            product_name: product.product_name,
            sku: product.sku,
            price: product.price,
            quantity: product.quantity,
          };
          cart.push(item);
        });
      } else if (orderType == 2) {
        $("#refNumber").val("");

        $("#customer option:selected").removeAttr("selected");

        $("#customer option")
          .filter(function () {
            return $(this).text() == customerOrderList[index].customer.name;
          })
          .prop("selected", true);

        holdOrder = customerOrderList[index].id;
        cart = [];
        $.each(customerOrderList[index].items, function (index, product) {
          item = {
            id: product.id,
            product_name: product.product_name,
            sku: product.sku,
            price: product.price,
            quantity: product.quantity,
          };
          cart.push(item);
        });
      }
      $(this).renderTable(cart);
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

      let data = {
        orderId: deleteId,
      };
      let diagOptions = {
        title: "Delete order?",
        text: "This will delete the order. Are you sure you want to delete!",
        icon: "warning",
        showCancelButton: true,
        okButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
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
            url: api + "delete",
            type: "POST",
            data: JSON.stringify(data),
            contentType: "application/json; charset=utf-8",
            cache: false,
            success: function (data) {
              $(this).getHoldOrders();
              $(this).getCustomerOrders();

              notiflix.Report.success(
                "Deleted!",
                "You have deleted the order!",
                "Ok",
              );
            },
            error: function (data) {
              $(".loading").hide();
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
      if ($("#payment").val() == "") {
        notiflix.Report.warning(
          "Nope!",
          "Please enter the amount that was paid!",
          "Ok",
        );
      } else {
        $(this).submitDueOrder(1);
      }
    });

    $("#transactions").on("click", function () {
      loadTransactions();
      loadUserList();

      $("#pos_view").hide();
      $("#pointofsale").show();
      $("#transactions_view").show();
      $(this).hide();
    });

    $("#pointofsale").on("click", function () {
      $("#pos_view").show();
      $("#transactions").show();
      $("#transactions_view").hide();
      $(this).hide();
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
    });

    $("#saveProduct").submit(function (e) {
      e.preventDefault();
      console.log("Save Product Form Submitted");

      $(this).attr("action", api + "inventory/product");
      $(this).attr("method", "POST");

      let data = $(this).serializeObject();
      console.log("Form Data:", data);

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
      $("#Products").modal("hide");
      $.get(api + "inventory/product/" + id, function (product) {
        $("#category option")
          .filter(function () {
            return $(this).val() == product.category;
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
      $("#Categories").modal("hide");
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
              notiflix.Report.success("Done!", "Category deleted", "Ok");
            },
          });
        },
      );
    };

    $("#productModal").on("click", function () {
      loadProductList();
    });

    $("#usersModal").on("click", function () {
      loadUserList();
    });

    $("#categoryModal").on("click", function () {
      loadCategoryList();
    });

    function loadUserList(page = 1) {
      let limit = 10;
      let url = api + "users/all?page=" + page + "&limit=" + limit;

      $.get(url, function (response) {
        let users = response.data;
        let total = response.total;
        allUsers = [...users]; // Update allUsers to current page for editUser to work (it uses index)

        let counter = 0;
        let user_list = "";
        $("#user_list").empty();
        // $("#userList").DataTable().destroy();

        users.forEach((user, index) => {
          state = [];
          let class_name = "";

          if (user.status != "") {
            state = user.status.split("_");
            login_status = state[0];
            login_time = state[1];

            switch (
              login_status // Fixed variable name from login to login_status
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
          user_list += `<tr>
            <td>${user.fullname}</td>
            <td>${user.username}</td>
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
      let limit = 10;

      if (query == "" && $("#searchProductList").val() != "") {
        query = $("#searchProductList").val();
      }

      let url = api + "inventory/products?page=" + page + "&limit=" + limit;
      if (query != "") url += "&q=" + query;

      console.log(
        "Loading Product List Page:",
        page,
        "Query:",
        query,
        "URL:",
        url,
      );
      $.get(url, function (response) {
        console.log("Product List Response:", response);
        let products = response.data;
        let total = response.total;

        let product_list = "";
        let counter = 0;
        $("#product_list").empty();
        // $("#productList").DataTable().destroy(); // removed datatable

        products.forEach((product, index) => {
          counter++;

          let category = allCategories.filter(function (cat) {
            return parseInt(cat.id) === parseInt(product.category);
          });

          product.stockAlert = "";
          const todayDate = moment();
          const expiryDate = moment(product.expirationDate, DATE_FORMAT);

          //show stock status indicator
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
          //calculate days to expiry
          product.expiryAlert = "";
          if (!isExpired(expiryDate)) {
            const diffDays = daysToExpire(expiryDate);

            if (diffDays > 0 && diffDays <= 30) {
              var days_noun = diffDays > 1 ? "days" : "day";
              icon = "fa fa-clock-o";
              product.expiryStatus = `${diffDays} ${days_noun} left`;
              product.expiryAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.expiryStatus}</small></p>`;
            }
          } else {
            icon = "fa fa-exclamation-triangle";
            product.expiryStatus = "Expired";
            product.expiryAlert = `<p class="text-danger"><small><i class="${icon}"></i> ${product.expiryStatus}</small></p>`;
          }

          product_list += `<tr>
              <td>${product.generic && product.generic !== "undefined" ? product.generic : product.name}</td>
              <td>${product.name}
              ${product.expiryAlert}</td>
              <td>${validator.unescape(settings.symbol)}${product.price}</td>
              <td>${product.stock == 1 ? product.quantity : "N/A"}
              ${product.stockAlert}
              </td>
              <td>${product.expirationDate}</td>
              <td>${category.length > 0 && category[0] ? category[0].name : ""}</td>
              <td class="nobr"><span class="btn-group"><button onClick="$(this).editProduct(${product.id})" class="btn btn-warning btn-sm"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteProduct(${
                product.id
              })" class="btn btn-danger btn-sm"><i class="fa fa-trash"></i></button></span></td></tr>`;

          // Note: editProduct index might refer to allProducts index in old code?
          // If we paginate, index 0 is first item on page.
          // editProduct uses allProducts[index].
          // We must update editProduct to use products[index] or update allProducts.
          // Since editProduct logic relies on `allProducts`, we should probably update `allProducts`
          // OR pass the full product object to editProduct.
          // Given constraints, I will update allProducts to be the current page products for management?
          // BUT loadProducts (POS) also sets allProducts. They conflict.
          // Best to pass ID to editProduct and fetch fresh, OR pass the object directly.
          // But `editProduct(index)` is called from HTML.
          // I will hack it: update allProducts? No, POS needs it.
          // I'll make a temporary `currentListProducts`?
          // Actually, I can just attach the product object to the button using data attribute!
          // But `onclick` string is hardcoded.
          // I will change the onClick to `editProduct(${product._id})` and fetch it?
          // Or `editProduct` uses `allProducts[index]`.
        });

        // Update allProducts? No, that breaks POS.
        // I will temporarily shadow allProducts for the list management? No.
        // I should change editProduct to accept ID and fetch, or look up in `products` array which I'll enable globally as `managementProducts`.

        $("#product_list").html(product_list);
        renderPagination(total, limit, page, "loadProductList", "#productList");
      });
    }

    function loadCategoryList(page = 1) {
      let limit = 10;
      let url = api + "categories/all?page=" + page + "&limit=" + limit;

      $.get(url, function (response) {
        let categories = response.data;
        let total = response.total;

        let category_list = "";
        let counter = 0;
        $("#category_list").empty();
        // $("#categoryList").DataTable().destroy();

        categories.forEach((category, index) => {
          counter++;
          category_list += `<tr>
            <td>${category.name}</td>
            <td><span class="btn-group"><button onClick="$(this).editCategory(${category.id})" class="btn btn-warning"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteCategory(${
              category.id
            })" class="btn btn-danger"><i class="fa fa-trash"></i></button></span></td></tr>`;
        });

        $("#category_list").html(category_list);
        renderPagination(
          total,
          limit,
          page,
          "loadCategoryList",
          "#categoryList",
        );
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

      // Update application field in settings form
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

      if (formData.password != formData.pass) {
        notiflix.Report.warning("Oops!", "Passwords do not match!", "Ok");
      }

      if (
        bcrypt.compare(formData.password, user.password) ||
        bcrypt.compare(formData.password, allUsers[user_index].password)
      ) {
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
      }
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
    // $("#logo_img").val('');
    $("#current_logo").hide(500);
    $(this).hide(500);
    $("#logoname").show(500);
  });

  $("#rmv_img").on("click", function () {
    $("#remove_img").val("1");
    // $("#img").val('');
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

  let discount = allTransactions[index].discount;
  let customer =
    allTransactions[index].customer == 0
      ? "Walk in Customer"
      : allTransactions[index].customer.username;
  let refNumber =
    allTransactions[index].ref_number != ""
      ? allTransactions[index].ref_number
      : allTransactions[index].id;
  let orderNumber = allTransactions[index].id;
  let paymentMethod = "";
  let tax_row = "";
  let items = "";
  let products = allTransactions[index].items;

  products.forEach((item) => {
    items += `<tr><td>${item.product_name}</td><td>${
      item.quantity
    } </td><td class="text-right"> ${validator.unescape(settings.symbol)} ${moneyFormat(
      Math.abs(item.price).toFixed(2),
    )} </td></tr>`;
  });

  paymentMethod = allTransactions[index].payment_type || "Cash";

  if (allTransactions[index].paid != "") {
    payment = `<tr>
                    <td>Paid</td>
                    <td>:</td>
                    <td class="text-right">${validator.unescape(settings.symbol)} ${moneyFormat(
                      Math.abs(allTransactions[index].paid).toFixed(2),
                    )}</td>
                </tr>
                <tr>
                    <td>Change</td>
                    <td>:</td>
                    <td class="text-right">${validator.unescape(settings.symbol)} ${moneyFormat(
                      Math.abs(allTransactions[index].change).toFixed(2),
                    )}</td>
                </tr>
                <tr>
                    <td>Method</td>
                    <td>:</td>
                    <td class="text-right">${paymentMethod}</td>
                </tr>`;
  }

  if (settings.charge_tax) {
    tax_row = `<tr>
                <td>Vat(${validator.unescape(settings.percentage)})% </td>
                <td>:</td>
                <td class="text-right">${validator.unescape(settings.symbol)}${parseFloat(
                  allTransactions[index].tax,
                ).toFixed(2)}</td>
            </tr>`;
  }

  logo = path.join(img_path, validator.unescape(settings.img));

  receipt = `<div style="font-family: 'Helvetica Neue', sans-serif; font-size: 12px; width: 100%; color: #333;">
        <div style="text-align: center; margin-bottom: 10px;">
            ${
              checkFileExists(logo)
                ? `<img style='max-width: 80px; margin-bottom: 5px;' src='${logo}' /><br>`
                : ``
            }
            <h3 style="margin: 0; font-size: 18px; font-weight: bold;">${validator.unescape(settings.store)}</h3>
            <p style="margin: 2px 0;">${validator.unescape(settings.address_one)}</p>
            <p style="margin: 2px 0;">${validator.unescape(settings.address_two)}</p>
            <p style="margin: 2px 0;">${
              validator.unescape(settings.contact) != ""
                ? "Tel: " + validator.unescape(settings.contact)
                : ""
            }</p>
            <p style="margin: 2px 0;">${
              validator.unescape(settings.tax) != ""
                ? "Vat No: " + validator.unescape(settings.tax)
                : ""
            }</p>
        </div>

        <div style="border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; padding: 5px 0; margin-bottom: 10px;">
            <table style="width: 100%; font-size: 11px;">
                <tr>
                    <td><strong>Order:</strong> ${orderNumber}</td>
                    <td style="text-align: right;"><strong>Date:</strong> ${moment(allTransactions[index].date).format("DD MMM YYYY HH:mm")}</td>
                </tr>
                <tr>
                    <td><strong>Cashier:</strong> ${allTransactions[index].user}</td>
                    <td style="text-align: right;"><strong>Ref:</strong> ${refNumber}</td>
                </tr>
                <tr>
                    <td colspan="2"><strong>Customer:</strong> ${
                      allTransactions[index].customer == 0
                        ? "Walk in Customer"
                        : allTransactions[index].customer.name
                    }</td>
                </tr>
            </table>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
            <thead>
                <tr style="border-bottom: 1px solid #000;">
                    <th style="text-align: left; padding: 5px 0;">Item</th>
                    <th style="text-align: center; padding: 5px 0;">Qty</th>
                    <th style="text-align: right; padding: 5px 0;">Price</th>
                </tr>
            </thead>
            <tbody>
                ${items}
            </tbody>
        </table>

        <div style="border-top: 1px solid #000; padding-top: 5px;">
             <table style="width: 100%; font-size: 12px;">
                <tr>
                    <td style="padding-top: 5px;">Subtotal:</td>
                    <td style="text-align: right; padding-top: 5px;">${validator.unescape(settings.symbol)}${moneyFormat(allTransactions[index].subtotal)}</td>
                </tr>
                ${
                  discount > 0
                    ? `<tr>
                        <td>Discount:</td>
                        <td style="text-align: right;">${validator.unescape(settings.symbol) + moneyFormat(parseFloat(allTransactions[index].discount).toFixed(2))}</td>
                       </tr>`
                    : ""
                }
                ${tax_row ? tax_row.replace(/<tr>/g, '<tr style="font-size: 11px; color: #666;">') : ""}
                <tr style="font-weight: bold; font-size: 14px;">
                    <td style="padding-top: 5px; border-top: 1px dashed #ccc;">Total:</td>
                    <td style="text-align: right; padding-top: 5px; border-top: 1px dashed #ccc;">${validator.unescape(settings.symbol)}${moneyFormat(allTransactions[index].total)}</td>
                </tr>
                 ${
                   payment != 0
                     ? `<tr>
                        <td style="padding-top: 5px;">Paid:</td>
                         <td style="text-align: right; padding-top: 5px;">${payment
                           .replace(/<td class="text-right">/g, "")
                           .replace(/<\/td>/g, "")
                           .replace(/<td>/g, "")
                           .replace(/<b>/g, "")
                           .replace(/<\/b>/g, "")}</td> 
                       </tr>`
                     : ""
                 }
                 ${
                   allTransactions[index].change > 0
                     ? `<tr>
                        <td>Change:</td>
                        <td style="text-align: right;">${validator.unescape(settings.symbol)}${moneyFormat(parseFloat(allTransactions[index].change).toFixed(2))}</td>
                       </tr>`
                     : ""
                 }
            </table>
        </div>

        <div style="text-align: center; margin-top: 15px; font-size: 11px; color: #666;">
            <p>${validator.unescape(settings.footer)}</p>
            <p>Thank you for purchasing!</p>
            <p>For inquiries, contact: ${validator.unescape(settings.contact)}</p>
        </div>
      </div>`;

  //prevent DOM XSS; allow windows paths in img src
  receipt = DOMPurify.sanitize(receipt, { ALLOW_UNKNOWN_PROTOCOLS: true });

  $("#viewTransaction").html("");
  $("#viewTransaction").html(receipt);

  $("#orderModal").modal("show");
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
          storage.set("user", data);
          ipcRenderer.send("app-reload", "");
          $("#login").hide();
        } else {
          notiflix.Report.warning("Oops!", auth_error, "Ok");
        }
      },
      error: function (data) {
        console.log(data);
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
