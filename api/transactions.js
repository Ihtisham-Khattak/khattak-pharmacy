const app = require("express")();
const bodyParser = require("body-parser");
const Inventory = require("./inventory");
const { db, ensureForeignKeysEnabled } = require("./db");

app.use(bodyParser.json());

// Ensure FK is enabled for every request
app.use(function (req, res, next) {
  ensureForeignKeysEnabled();
  next();
});

module.exports = app;

/**
 * GET endpoint: Get details of all transactions.
 */
app.get("/all", function (req, res) {
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
app.get("/by-date", function (req, res) {
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
    
    // Validate required fields
    if (!t.user_id) {
      console.error("Missing user_id in transaction");
      return res.status(400).json({
        error: "Missing User",
        message: "User information is missing. Please login again."
      });
    }
    
    // Validate user_id exists
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(parseInt(t.user_id));
    if (!user) {
      console.error("User not found:", t.user_id);
      return res.status(400).json({ 
        error: "Invalid User", 
        message: "The specified user does not exist. Please login again." 
      });
    }
    
    // Validate customer_id exists
    const customerId = t.customer_id || 0;
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
    if (!customer) {
      console.error("Customer not found:", customerId);
      return res.status(400).json({ 
        error: "Invalid Customer", 
        message: "The specified customer does not exist." 
      });
    }
    
    // Validate each item in the transaction
    if (t.items && Array.isArray(t.items)) {
      for (const item of t.items) {
        const productId = parseInt(item.id);
        if (isNaN(productId)) {
          console.error("Invalid product ID:", item.id);
          continue;
        }
        const product = db.prepare("SELECT id, name, category_id FROM inventory WHERE id = ?").get(productId);
        if (!product) {
          console.error("Product not found:", item.id, "item:", item);
          return res.status(400).json({
            error: "Invalid Product",
            message: `Product with ID ${item.id} does not exist in inventory.`
          });
        }
        // Check if category_id is valid
        if (product.category_id) {
          const category = db.prepare("SELECT id FROM categories WHERE id = ?").get(product.category_id);
          if (!category) {
            console.error("Category not found for product:", item.id, "product:", product.name, "category_id:", product.category_id);
            return res.status(400).json({
              error: "Invalid Category",
              message: `Product "${product.name}" has an invalid category. Please update the product.`
            });
          }
        }
      }
    }
    
    // Ensure till is a valid number
    const tillValue = t.till !== undefined && t.till !== null ? parseInt(t.till) : 0;
    
    db.prepare(
      `
      INSERT INTO transactions (id, date, user_id, till, status, total, paid, change, customer_id, ref_number, items, payment_type, discount, tax)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      t._id ? t._id.toString() : "",
      t.date,
      parseInt(t.user_id),
      tillValue,
      t.status,
      parseFloat(t.total) || 0,
      parseFloat(t.paid) || 0,
      parseFloat(t.change) || 0,
      customerId,
      t.ref_number || "",
      JSON.stringify(t.items),
      t.payment_type || "Cash",
      parseFloat(t.discount) || 0,
      parseFloat(t.tax) || 0,
    );

    if (parseFloat(t.paid) >= parseFloat(t.total)) {
      console.log('[transactions] About to decrement inventory with items:', JSON.stringify(t.items));
      Inventory.decrementInventory(t.items);
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
 */
app.put("/new", function (req, res) {
  try {
    const t = req.body;
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
      t.user_id,
      t.till,
      t.status,
      t.total,
      t.paid,
      t.change,
      t.customer_id || 0,
      t.ref_number || "",
      JSON.stringify(t.items),
      t.payment_type || "Cash",
      t.discount || 0,
      t.tax || 0,
      t._id ? t._id.toString() : "",
    );
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * POST endpoint: Delete a transaction.
 */
app.post("/delete", function (req, res) {
  try {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(
      req.body.orderId.toString(),
    );
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
