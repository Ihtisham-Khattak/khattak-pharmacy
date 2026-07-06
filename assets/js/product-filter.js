$(document).ready(function () {
  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  $("#categories").on("change", function () {
    let selected = $("#categories option:selected").val();
    if (selected == "0") {
      $("#parent > div").fadeIn(450);
    } else {
      var $el = $("." + selected).fadeIn(450);
      $("#parent > div").not($el).hide();
    }
  });

  function searchProducts() {
    var rawValue = $("#search").val();
    try {
      var matcher = new RegExp(escapeRegex(rawValue), "gi");
      $(".box")
        .show()
        .not(function () {
          try {
            return matcher.test($(this).find(".name, .sku").text());
          } catch (innerErr) {
            return $(this).find(".name, .sku").text().toLowerCase().indexOf(rawValue.toLowerCase()) !== -1;
          }
        })
        .hide();
    } catch (err) {
      $(".box")
        .show()
        .not(function () {
          return $(this).find(".name, .sku").text().toLowerCase().indexOf(String(rawValue).toLowerCase()) !== -1;
        })
        .hide();
    }
  }

  let $search = $("#search").on("input", function () {
    searchProducts();
  });

  $("body").on("click", "#jq-keyboard button", function (e) {
    if ($("#search").is(":focus")) {
      searchProducts();
    }
  });

  function searchOpenOrders() {
    var rawValue = $("#holdOrderInput").val();
    try {
      var matcher = new RegExp(escapeRegex(rawValue), "gi");
      $(".order")
        .show()
        .not(function () {
          try {
            return matcher.test($(this).find(".ref_number").text());
          } catch (innerErr) {
            return $(this).find(".ref_number").text().toLowerCase().indexOf(rawValue.toLowerCase()) !== -1;
          }
        })
        .hide();
    } catch (err) {
      $(".order")
        .show()
        .not(function () {
          return $(this).find(".ref_number").text().toLowerCase().indexOf(String(rawValue).toLowerCase()) !== -1;
        })
        .hide();
    }
  }

  var $searchHoldOrder = $("#holdOrderInput").on("input", function () {
    searchOpenOrders();
  });

  $("body").on("click", ".holdOrderKeyboard .key", function () {
    if ($("#holdOrderInput").is(":focus")) {
      searchOpenOrders();
    }
  });

  function searchCustomerOrders() {
    var rawValue = $("#holdCustomerOrderInput").val();
    try {
      var matcher = new RegExp(escapeRegex(rawValue), "gi");
      $(".customer-order")
        .show()
        .not(function () {
          try {
            return matcher.test($(this).find(".customer_name").text());
          } catch (innerErr) {
            return $(this).find(".customer_name").text().toLowerCase().indexOf(rawValue.toLowerCase()) !== -1;
          }
        })
        .hide();
    } catch (err) {
      $(".customer-order")
        .show()
        .not(function () {
          return $(this).find(".customer_name").text().toLowerCase().indexOf(String(rawValue).toLowerCase()) !== -1;
        })
        .hide();
    }
  }

  $("#holdCustomerOrderInput").on("input", function () {
      searchCustomerOrders();
    }
  );

  $("body").on("click", ".customerOrderKeyboard .key", function () {
    if ($("#holdCustomerOrderInput").is(":focus")) {
      searchCustomerOrders();
    }
  });

});