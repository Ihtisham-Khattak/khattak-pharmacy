const app = require("express")();
const bodyParser = require("body-parser");
const Inventory = require("./inventory");
const { db, ensureForeignKeysEnabled } = require("./db");
const { requireAuth, requirePermission } = require("./middleware/auth");

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
      items: JSON.parse(t.items),
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
      items: JSON.parse(t.items),
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
      items: JSON.parse(t.items),
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
      items: JSON.parse(t.items),
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
 * Validates user_id, customer_id, and each item's product/category existence.
 * Also computes the authoritative subtotal (sum of product.price * quantity)
 * from server-side inventory data (never trusting client-supplied prices).
 * Returns { error: {status, body} } on failure, or { subtotal } on success.
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

  let subtotal = 0;

  if (t.items && Array.isArray(t.items)) {
    for (const item of t.items) {
      const productId = parseInt(item.id);
      if (isNaN(productId)) {
        console.error("Invalid product ID:", item.id);
        continue;
      }
      const product = db
        .prepare("SELECT id, name, price, category_id FROM inventory WHERE id = ?")
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
      // Check if category_id is valid
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
      subtotal += (parseFloat(product.price) || 0) * qty;
    }
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

    // Debug logging
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

    const paid = parseFloat(t.paid) || 0;
    if (paid < finalTotal - FLOAT_TOLERANCE) {
      return res.status(400).json({
        error: "Insufficient Payment",
        message: "The amount paid is less than the order total.",
      });
    }
    const change = paid - finalTotal;

    // Ensure till is a valid number
    const tillValue = t.till !== undefined && t.till !== null ? parseInt(t.till) : 0;

    const insertStmt = db.prepare(
      `
      INSERT INTO transactions (id, date, user_id, till, status, total, paid, change, customer_id, ref_number, items, payment_type, discount, tax)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );

    // Wrap the INSERT and the inventory decrement together so that if
    // decrementInventory throws (e.g. oversell, or a product deleted mid-flight),
    // the transaction row insert rolls back too instead of leaving an orphaned
    // committed sale with no matching stock adjustment.
    const runAtomic = db.transaction(() => {
      insertStmt.run(
        t._id ? t._id.toString() : "",
        t.date,
        parseInt(t.user_id),
        tillValue,
        t.status,
        finalTotal,
        paid,
        change,
        customerId,
        t.ref_number || "",
        JSON.stringify(t.items),
        t.payment_type || "Cash",
        discount,
        finalTax,
      );

      console.log('[transactions] About to decrement inventory with items:', JSON.stringify(t.items));
      Inventory.decrementInventory(t.items);
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

    res.sendStatus(200);
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
 */
app.put("/new", requirePermission("perm_transactions"), function (req, res) {
  try {
    const t = req.body;
    const id = t._id ? t._id.toString() : "";

    const existing = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(id);
    if (!existing) {
      return res.status(400).json({
        error: "Invalid Transaction",
        message: "The specified transaction does not exist.",
      });
    }

    // Items must not change on update - see LIMITATION above.
    let existingItems;
    try {
      existingItems = JSON.parse(existing.items);
    } catch (e) {
      existingItems = existing.items;
    }
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

    const paid = parseFloat(t.paid) || 0;
    if (paid < authoritativeTotal - FLOAT_TOLERANCE) {
      return res.status(400).json({
        error: "Insufficient Payment",
        message: "The amount paid is less than the order total.",
      });
    }
    const change = paid - authoritativeTotal;

    const tillValue =
      t.till !== undefined && t.till !== null ? parseInt(t.till) : 0;

    try {
      db.prepare(
        `
        UPDATE transactions SET
          date = ?, user_id = ?, till = ?, status = ?,
          total = ?, paid = ?, change = ?,
          customer_id = ?, ref_number = ?, items = ?,
          payment_type = ?, discount = ?, tax = ?
        WHERE id = ?
      `,
      ).run(
        t.date,
        parseInt(t.user_id),
        tillValue,
        t.status,
        authoritativeTotal,
        paid,
        change,
        customerId,
        t.ref_number || "",
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

    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * POST endpoint: Delete a transaction.
 * NOTE: this is a hard delete with no inventory restoration - kept for
 * backward compatibility as an admin cleanup path only. Prefer
 * POST /void/:transactionId to reverse a sale, since it preserves the
 * audit trail (marks the transaction voided instead of removing the row)
 * and restores inventory quantities.
 */
app.post("/delete", requirePermission("perm_transactions"), function (req, res) {
  try {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(
      req.body.orderId.toString(),
    );
    res.sendStatus(200);
  } catch (err) {
    if (err && err.code && err.code.indexOf("SQLITE_CONSTRAINT") === 0) {
      return res.status(409).json({
        error: "Conflict",
        message:
          "This transaction cannot be deleted because other records still reference it.",
      });
    }
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * POST endpoint: Void a transaction. Restores inventory quantities for
 * each item and marks the transaction as voided (status = -1), preserving
 * the row for audit purposes rather than deleting it.
 */
app.post("/void/:transactionId", requirePermission("perm_transactions"), function (req, res) {
  try {
    const id = req.params.transactionId;
    const existing = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(id);
    if (!existing) {
      return res.status(400).json({
        error: "Invalid Transaction",
        message: "The specified transaction does not exist.",
      });
    }
    if (existing.status === -1) {
      return res.status(400).json({
        error: "Already Voided",
        message: "This transaction has already been voided.",
      });
    }

    let items;
    try {
      items = JSON.parse(existing.items);
    } catch (e) {
      items = [];
    }

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
          incrementStmt.run(qty, productId);
        }
      }
      voidStmt.run(id);
    });

    try {
      runVoid();
    } catch (txErr) {
      if (txErr && txErr.code && txErr.code.indexOf("SQLITE_CONSTRAINT") === 0) {
        return res.status(409).json({
          error: "Conflict",
          message:
            "This transaction cannot be voided because related data no longer exists.",
        });
      }
      throw txErr;
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
      res.send({ ...t, items: JSON.parse(t.items) });
    } else {
      res.send(null);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});
