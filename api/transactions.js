const app = require("express")();
const bodyParser = require("body-parser");
const crypto = require("crypto");
const moment = require("moment");
const Inventory = require("./inventory");
const { db, ensureForeignKeysEnabled } = require("./db");
const {
  writeTransactionItems,
  readTransactionItems,
  recordStockMovementsForItems,
} = require("./schemaHelpers");
const { requireAuth, requirePermission } = require("./middleware/auth");

const EXPIRY_DATE_FORMAT = "DD-MMM-YYYY";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isProductExpired(expirationDate) {
  if (!expirationDate) return false;
  const raw = String(expirationDate).trim();
  if (!raw) return false;
  let expiry = moment(raw, EXPIRY_DATE_FORMAT, true);
  if (!expiry.isValid()) {
    expiry = moment(raw);
  }
  if (!expiry.isValid()) return false;
  return moment().startOf("day").isSameOrAfter(expiry.startOf("day"));
}

function sanitizeHoldContact(t, isHold) {
  const name = t.hold_customer_name != null ? String(t.hold_customer_name).trim() : "";
  const phone = t.hold_customer_phone != null ? String(t.hold_customer_phone).trim() : "";

  if (!isHold) {
    return { holdCustomerName: name, holdCustomerPhone: phone };
  }

  if (!name) {
    return {
      error: {
        status: 400,
        body: {
          error: "Customer Required",
          message: "Customer name is required for hold orders.",
        },
      },
    };
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return {
      error: {
        status: 400,
        body: {
          error: "Invalid Phone",
          message: "Enter a valid phone number (7–15 digits).",
        },
      },
    };
  }

  const ref = t.ref_number != null ? String(t.ref_number).trim() : "";
  if (!ref) {
    return {
      error: {
        status: 400,
        body: {
          error: "Reference Required",
          message: "Hold orders require a reference number.",
        },
      },
    };
  }

  return { holdCustomerName: name.slice(0, 80), holdCustomerPhone: phone.slice(0, 20) };
}

function resolveTransactionId(t) {
  const candidate =
    t._id != null && t._id !== ""
      ? String(t._id)
      : t.id != null && t.id !== ""
        ? String(t.id)
        : "";
  if (candidate && UUID_RE.test(candidate)) {
    return candidate;
  }
  return crypto.randomUUID();
}

/**
 * Restores inventory for a transaction's items and marks it voided (status=-1).
 * Returns { ok: true } or { error: { status, body } }.
 */
function voidTransactionById(id) {
  const existing = db
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(id);
  if (!existing) {
    return {
      error: {
        status: 400,
        body: {
          error: "Invalid Transaction",
          message: "The specified transaction does not exist.",
        },
      },
    };
  }
  if (existing.status === -1) {
    return {
      error: {
        status: 400,
        body: {
          error: "Already Voided",
          message: "This transaction has already been voided.",
        },
      },
    };
  }

  let items = readTransactionItems(db, existing);

  const incrementStmt = db.prepare(
    "UPDATE inventory SET quantity = quantity + ? WHERE id = ?",
  );
  const voidStmt = db.prepare(
    "UPDATE transactions SET status = -1 WHERE id = ?",
  );

  const runVoid = db.transaction(() => {
    if (Array.isArray(items)) {
      for (const item of items) {
        const productId = parseInt(item.id);
        const qty = parseFloat(item.quantity) || 0;
        if (isNaN(productId) || qty <= 0) continue;
        const result = incrementStmt.run(qty, productId);
        if (result.changes === 0) {
          throw new Error(
            `Cannot restore stock for missing product ID ${productId}`,
          );
        }
        if (typeof Inventory.syncOutOfStock === "function") {
          Inventory.syncOutOfStock(db, productId);
        }
      }
      recordStockMovementsForItems(db, items, {
        reason: "void",
        refType: "transaction",
        refId: id,
        userId: existing.user_id,
        sign: 1,
      });
    }
    voidStmt.run(id);
  });

  try {
    runVoid();
  } catch (txErr) {
    if (txErr && txErr.code && txErr.code.indexOf("SQLITE_CONSTRAINT") === 0) {
      return {
        error: {
          status: 409,
          body: {
            error: "Conflict",
            message:
              "This transaction cannot be voided because related data no longer exists.",
          },
        },
      };
    }
    return {
      error: {
        status: 400,
        body: {
          error: "Void Failed",
          message: txErr.message,
        },
      },
    };
  }

  return { ok: true, existing };
}

app.use(bodyParser.json());

// Ensure FK is enabled for every request
app.use(function (req, res, next) {
  ensureForeignKeysEnabled();
  next();
});

// All routes below require a valid session.
app.use(requireAuth);

module.exports = app;

/**
 * GET endpoint: Get details of all transactions.
 */
app.get("/all", requirePermission("perm_transactions"), function (req, res) {
  try {
    const transactions = db.prepare("SELECT * FROM transactions").all();
    // Parse items JSON for each transaction
    const formatted = transactions.map((t) => ({
      ...t,
      items: readTransactionItems(db, t),
    }));
    res.send(formatted);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * GET endpoint: Get on-hold transactions.
 */
app.get("/on-hold", function (req, res) {
  try {
    const transactions = db
      .prepare(
        "SELECT * FROM transactions WHERE ref_number != '' AND status = 0",
      )
      .all();
    const formatted = transactions.map((t) => ({
      ...t,
      items: readTransactionItems(db, t),
    }));
    res.send(formatted);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * GET endpoint: Get customer orders.
 */
app.get("/customer-orders", function (req, res) {
  try {
    const transactions = db
      .prepare(
        "SELECT * FROM transactions WHERE customer_id != 0 AND status = 0 AND ref_number = ''",
      )
      .all();
    const formatted = transactions.map((t) => ({
      ...t,
      items: readTransactionItems(db, t),
    }));
    res.send(formatted);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * GET endpoint: Get transactions by date range and filters.
 */
app.get("/by-date", requirePermission("perm_transactions"), function (req, res) {
  let { start, end, user, till, status } = req.query;
  let query =
    "SELECT * FROM transactions WHERE date >= ? AND date <= ? AND status = ?";
  let params = [start, end, parseInt(status)];

  if (parseInt(user) !== 0) {
    query += " AND user_id = ?";
    params.push(parseInt(user));
  }
  if (parseInt(till) !== 0) {
    query += " AND till = ?";
    params.push(parseInt(till));
  }

  try {
    const transactions = db.prepare(query).all(...params);
    const formatted = transactions.map((t) => ({
      ...t,
      items: readTransactionItems(db, t),
    }));
    res.send(formatted);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Tolerance for floating point comparisons between client-supplied and
// server-recomputed monetary values.
const FLOAT_TOLERANCE = 0.01;

/**
 * Validates customer_id and each item's product/category existence.
 * Also computes the authoritative subtotal (sum of product.price * quantity)
 * from server-side inventory data (never trusting client-supplied prices).
 * user_id must already be set from the session by the route handler.
 * Returns { error: {status, body} } on failure, or { subtotal, customerId } on success.
 */
function validateTransactionInputs(t) {
  if (!t.user_id) {
    console.error("Missing user_id in transaction");
    return {
      error: {
        status: 400,
        body: {
          error: "Missing User",
          message: "User information is missing. Please login again.",
        },
      },
    };
  }

  const user = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(parseInt(t.user_id));
  if (!user) {
    console.error("User not found:", t.user_id);
    return {
      error: {
        status: 400,
        body: {
          error: "Invalid User",
          message: "The specified user does not exist. Please login again.",
        },
      },
    };
  }

  const customerId = t.customer_id || 0;
  const customer = db
    .prepare("SELECT id FROM customers WHERE id = ?")
    .get(customerId);
  if (!customer) {
    console.error("Customer not found:", customerId);
    return {
      error: {
        status: 400,
        body: {
          error: "Invalid Customer",
          message: "The specified customer does not exist.",
        },
      },
    };
  }

  if (!t.items || !Array.isArray(t.items) || t.items.length === 0) {
    return {
      error: {
        status: 400,
        body: {
          error: "Empty Cart",
          message: "At least one item is required.",
        },
      },
    };
  }

  let subtotal = 0;

  for (const item of t.items) {
    const productId = parseInt(item.id);
    if (isNaN(productId)) {
      return {
        error: {
          status: 400,
          body: {
            error: "Invalid Product",
            message: `Invalid product ID: ${item.id}`,
          },
        },
      };
    }
    const product = db
      .prepare(
        "SELECT id, name, price, category_id, expirationDate FROM inventory WHERE id = ?",
      )
      .get(productId);
    if (!product) {
      console.error("Product not found:", item.id, "item:", item);
      return {
        error: {
          status: 400,
          body: {
            error: "Invalid Product",
            message: `Product with ID ${item.id} does not exist in inventory.`,
          },
        },
      };
    }

    if (isProductExpired(product.expirationDate)) {
      return {
        error: {
          status: 400,
          body: {
            error: "Expired Product",
            message: `"${product.name}" is expired and cannot be sold.`,
          },
        },
      };
    }

    if (product.category_id) {
      const category = db
        .prepare("SELECT id FROM categories WHERE id = ?")
        .get(product.category_id);
      if (!category) {
        console.error(
          "Category not found for product:",
          item.id,
          "product:",
          product.name,
          "category_id:",
          product.category_id,
        );
        return {
          error: {
            status: 400,
            body: {
              error: "Invalid Category",
              message: `Product "${product.name}" has an invalid category. Please update the product.`,
            },
          },
        };
      }
    }

    const qty = parseFloat(item.quantity) || 0;
    if (qty <= 0) {
      return {
        error: {
          status: 400,
          body: {
            error: "Invalid Quantity",
            message: `Quantity for "${product.name}" must be greater than zero.`,
          },
        },
      };
    }
    subtotal += (parseFloat(product.price) || 0) * qty;
  }

  return { customerId, subtotal };
}

/**
 * Computes an authoritative total/tax from a server-side subtotal, a
 * client-supplied discount and the store's tax settings, mirroring the
 * frontend's own calculateCart() formula:
 *   total = subtotal - discount
 *   tax   = charge_tax ? total * percentage / 100 : 0
 *   grossTotal = total + tax
 * Returns { error } if the discount is invalid, otherwise
 * { discount, taxAmount, authoritativeTotal }.
 */
function computeAuthoritativeTotals(subtotal, rawDiscount) {
  const discount = parseFloat(rawDiscount);
  const effectiveDiscount = isNaN(discount) ? 0 : discount;

  if (rawDiscount !== undefined && rawDiscount !== null && rawDiscount !== "") {
    if (isNaN(discount) || discount < 0) {
      return {
        error: {
          status: 400,
          body: {
            error: "Invalid Discount",
            message: "Discount must be a non-negative number.",
          },
        },
      };
    }
    if (discount > subtotal + FLOAT_TOLERANCE) {
      return {
        error: {
          status: 400,
          body: {
            error: "Invalid Discount",
            message: "Discount cannot exceed the order subtotal.",
          },
        },
      };
    }
  }

  const afterDiscount = subtotal - effectiveDiscount;

  const settings = db
    .prepare("SELECT tax, percentage, charge_tax FROM settings WHERE id = 1")
    .get();

  let taxAmount = 0;
  if (settings && settings.charge_tax) {
    const percentage = parseFloat(settings.percentage) || 0;
    taxAmount = (afterDiscount * percentage) / 100;
  }

  const authoritativeTotal = afterDiscount + taxAmount;

  return { discount: effectiveDiscount, taxAmount, authoritativeTotal };
}

/**
 * POST endpoint: Create a new transaction.
 */
app.post("/new", function (req, res) {
  try {
    const t = req.body;
    // Never trust client-supplied cashier identity.
    t.user_id = req.user.id;

    console.log("Transaction data:", {
      _id: t._id,
      id: t.id,
      user_id: t.user_id,
      user: t.user,
      customer_id: t.customer_id,
      till: t.till,
      status: t.status,
      items_count: t.items ? t.items.length : 0,
      total: t.total,
      paid: t.paid
    });

    const validation = validateTransactionInputs(t);
    if (validation.error) {
      return res.status(validation.error.status).json(validation.error.body);
    }
    const { customerId, subtotal } = validation;

    const totals = computeAuthoritativeTotals(subtotal, t.discount);
    if (totals.error) {
      return res.status(totals.error.status).json(totals.error.body);
    }
    const { discount, taxAmount, authoritativeTotal } = totals;

    const clientTotal = parseFloat(t.total) || 0;
    // Never trust the client-supplied total: use the authoritative,
    // server-recomputed total/tax whenever they diverge beyond floating
    // point tolerance. This closes the "submit total:0" free-goods exploit.
    const finalTotal = authoritativeTotal;
    const finalTax = taxAmount;
    if (Math.abs(clientTotal - authoritativeTotal) > FLOAT_TOLERANCE) {
      console.warn(
        `[transactions] Client-supplied total (${clientTotal}) does not match authoritative total (${authoritativeTotal}). Using authoritative value.`,
      );
    }

    const status = parseInt(t.status, 10);
    const isHold = status === 0;
    const contact = sanitizeHoldContact(t, isHold);
    if (contact.error) {
      return res.status(contact.error.status).json(contact.error.body);
    }
    const { holdCustomerName, holdCustomerPhone } = contact;

    const paid = parseFloat(t.paid) || 0;
    // Hold orders park the cart unpaid; only completed sales require payment.
    if (!isHold && paid < finalTotal - FLOAT_TOLERANCE) {
      return res.status(400).json({
        error: "Insufficient Payment",
        message: "The amount paid is less than the order total.",
      });
    }
    const finalPaid = isHold ? 0 : paid;
    const change = isHold ? 0 : finalPaid - finalTotal;

    // Ensure till is a valid number
    const tillValue = t.till !== undefined && t.till !== null ? parseInt(t.till) : 0;
    const txnId = resolveTransactionId(t);

    const insertStmt = db.prepare(
      `
      INSERT INTO transactions (id, date, user_id, till, status, total, paid, change, customer_id, ref_number, hold_customer_name, hold_customer_phone, items, payment_type, discount, tax)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );

    // Wrap the INSERT and the inventory decrement together so that if
    // decrementInventory throws (e.g. oversell, or a product deleted mid-flight),
    // the transaction row insert rolls back too instead of leaving an orphaned
    // committed sale with no matching stock adjustment.
    const runAtomic = db.transaction(() => {
      insertStmt.run(
        txnId,
        t.date,
        parseInt(t.user_id),
        tillValue,
        status,
        finalTotal,
        finalPaid,
        change,
        customerId,
        t.ref_number || "",
        holdCustomerName,
        holdCustomerPhone,
        JSON.stringify(t.items),
        t.payment_type || "Cash",
        discount,
        finalTax,
      );

      writeTransactionItems(db, txnId, t.items);

      console.log('[transactions] About to decrement inventory with items:', JSON.stringify(t.items));
      Inventory.decrementInventory(t.items);

      recordStockMovementsForItems(db, t.items, {
        reason: isHold ? "hold_reserve" : "sale",
        refType: "transaction",
        refId: txnId,
        userId: parseInt(t.user_id),
        sign: -1,
      });
    });

    try {
      runAtomic();
    } catch (txErr) {
      console.error("Transaction/inventory error:", txErr);
      if (
        txErr &&
        txErr.code &&
        txErr.code.indexOf("SQLITE_CONSTRAINT") === 0
      ) {
        return res.status(409).json({
          error: "Conflict",
          message:
            "This sale conflicts with existing data (e.g. a related record no longer exists).",
        });
      }
      return res.status(400).json({
        error: "Insufficient Stock",
        message: txErr.message,
      });
    }

    res.status(200).json({ id: txnId });
  } catch (err) {
    console.error("Transaction error:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * PUT endpoint: Update an existing transaction.
 *
 * LIMITATION: the original sale already decremented inventory once at
 * creation time. Reconciling inventory against an item-list change on
 * update (partial re-decrement/re-credit) is a materially harder problem
 * that is out of scope for this pass. Instead, we validate that t.items is
 * unchanged from the stored row's items and reject the update with 400 if
 * it differs. Non-inventory-affecting fields (ref_number, status,
 * payment_type, etc.) may still be updated freely.
 *
 * Cashiers without perm_transactions may complete a hold (status 0 → 1).
 * All other updates require perm_transactions.
 */
app.put("/new", function (req, res) {
  try {
    const t = req.body;
    t.user_id = req.user.id;
    const id = t._id != null && t._id !== "" ? String(t._id) : String(t.id || "");

    const existing = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(id);
    if (!existing) {
      return res.status(400).json({
        error: "Invalid Transaction",
        message: "The specified transaction does not exist.",
      });
    }

    const nextStatus = parseInt(t.status, 10);
    const isHoldToPaid = existing.status === 0 && nextStatus === 1;
    if (!isHoldToPaid && req.user.perm_transactions !== 1) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      });
    }

    // Items must not change on update - see LIMITATION above.
    const existingItems = readTransactionItems(db, existing);
    if (JSON.stringify(existingItems) !== JSON.stringify(t.items)) {
      return res.status(400).json({
        error: "Items Changed",
        message:
          "Transaction items cannot be modified on update. Void the transaction and create a new one instead.",
      });
    }

    const validation = validateTransactionInputs(t);
    if (validation.error) {
      return res.status(validation.error.status).json(validation.error.body);
    }
    const { customerId, subtotal } = validation;

    const totals = computeAuthoritativeTotals(subtotal, t.discount);
    if (totals.error) {
      return res.status(totals.error.status).json(totals.error.body);
    }
    const { discount, taxAmount, authoritativeTotal } = totals;

    const isHold = nextStatus === 0;
    // Preserve hold contact when completing a recalled hold via payment.
    if (existing.status === 0) {
      if (!t.hold_customer_name) {
        t.hold_customer_name = existing.hold_customer_name || "";
      }
      if (!t.hold_customer_phone) {
        t.hold_customer_phone = existing.hold_customer_phone || "";
      }
      if (!t.ref_number) {
        t.ref_number = existing.ref_number || "";
      }
    }
    const contact = sanitizeHoldContact(t, isHold);
    if (contact.error) {
      return res.status(contact.error.status).json(contact.error.body);
    }
    const { holdCustomerName, holdCustomerPhone } = contact;

    const paid = parseFloat(t.paid) || 0;
    if (!isHold && paid < authoritativeTotal - FLOAT_TOLERANCE) {
      return res.status(400).json({
        error: "Insufficient Payment",
        message: "The amount paid is less than the order total.",
      });
    }
    const finalPaid = isHold ? 0 : paid;
    const change = isHold ? 0 : finalPaid - authoritativeTotal;

    const tillValue =
      t.till !== undefined && t.till !== null ? parseInt(t.till) : 0;

    try {
      db.prepare(
        `
        UPDATE transactions SET
          date = ?, user_id = ?, till = ?, status = ?,
          total = ?, paid = ?, change = ?,
          customer_id = ?, ref_number = ?,
          hold_customer_name = ?, hold_customer_phone = ?,
          items = ?,
          payment_type = ?, discount = ?, tax = ?
        WHERE id = ?
      `,
      ).run(
        t.date,
        parseInt(t.user_id),
        tillValue,
        nextStatus,
        authoritativeTotal,
        finalPaid,
        change,
        customerId,
        t.ref_number || "",
        holdCustomerName,
        holdCustomerPhone,
        JSON.stringify(t.items),
        t.payment_type || "Cash",
        discount,
        taxAmount,
        id,
      );
    } catch (txErr) {
      if (
        txErr &&
        txErr.code &&
        txErr.code.indexOf("SQLITE_CONSTRAINT") === 0
      ) {
        return res.status(409).json({
          error: "Conflict",
          message:
            "This update conflicts with existing data (e.g. a related record no longer exists).",
        });
      }
      throw txErr;
    }

    res.status(200).json({ id });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * POST endpoint: Cancel/void a transaction (legacy path).
 * Hard-delete after stock movement is no longer allowed — this restores
 * inventory and marks status = -1 (same as POST /void/:id).
 */
app.post("/delete", function (req, res) {
  try {
    const orderId =
      req.body && req.body.orderId != null ? String(req.body.orderId) : "";
    if (!orderId) {
      return res.status(400).json({
        error: "Missing Order",
        message: "orderId is required.",
      });
    }

    const existing = db
      .prepare("SELECT status FROM transactions WHERE id = ?")
      .get(orderId);
    if (!existing) {
      return res.status(400).json({
        error: "Invalid Transaction",
        message: "The specified transaction does not exist.",
      });
    }
    // Cashiers may cancel open holds; completed sales require transactions perm.
    if (existing.status !== 0 && req.user.perm_transactions !== 1) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      });
    }

    const result = voidTransactionById(orderId);
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * POST endpoint: Void a transaction. Restores inventory quantities for
 * each item and marks the transaction as voided (status = -1), preserving
 * the row for audit purposes rather than deleting it.
 * Cashiers may void open holds (status 0); completed sales need perm_transactions.
 */
app.post("/void/:transactionId", function (req, res) {
  try {
    const id = req.params.transactionId;
    const existing = db
      .prepare("SELECT status FROM transactions WHERE id = ?")
      .get(id);
    if (!existing) {
      return res.status(400).json({
        error: "Invalid Transaction",
        message: "The specified transaction does not exist.",
      });
    }
    if (existing.status !== 0 && req.user.perm_transactions !== 1) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      });
    }

    const result = voidTransactionById(id);
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * GET endpoint: Get a specific transaction.
 */
app.get("/:transactionId", function (req, res) {
  try {
    const t = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(req.params.transactionId);
    if (t) {
      res.send({ ...t, items: readTransactionItems(db, t) });
    } else {
      res.send(null);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});
