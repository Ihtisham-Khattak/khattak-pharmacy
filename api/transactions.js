const app = require("express")();
const bodyParser = require("body-parser");
const Inventory = require("./inventory");
const { db } = require("./db");

app.use(bodyParser.json());

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
    db.prepare(
      `
      INSERT INTO transactions (id, date, user_id, till, status, total, paid, change, customer_id, ref_number, items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      t._id.toString(),
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
    );

    if (t.paid >= t.total) {
      Inventory.decrementInventory(t.items);
    }
    res.sendStatus(200);
  } catch (err) {
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
        customer_id = ?, ref_number = ?, items = ?
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
      t._id.toString(),
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
