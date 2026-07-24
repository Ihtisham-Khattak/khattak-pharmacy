const app = require("express")();
const bodyParser = require("body-parser");
const { db, ensureForeignKeysEnabled } = require("./db");
const { requireAuth, requirePermission } = require("./middleware/auth");

app.use(bodyParser.json());

app.use(function (req, res, next) {
  ensureForeignKeysEnabled();
  next();
});

app.use(requireAuth);

module.exports = app;

function ensureCustomerAccount(customerId) {
  const existing = db
    .prepare("SELECT customer_id FROM customer_accounts WHERE customer_id = ?")
    .get(customerId);
  if (!existing) {
    db.prepare(
      "INSERT INTO customer_accounts (customer_id, balance) VALUES (?, 0)",
    ).run(customerId);
  }
}

app.get("/account/:customerId", function (req, res) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        error: "Invalid Customer",
        message: "Invalid customer ID.",
      });
    }

    const account = db
      .prepare("SELECT * FROM customer_accounts WHERE customer_id = ?")
      .get(customerId);
    if (account) {
      return res.json(account);
    }
    res.json({ customer_id: customerId, balance: 0 });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

app.post("/payment", requirePermission("perm_transactions"), function (req, res) {
  try {
    const { customer_id, amount, note } = req.body;
    const customerId = parseInt(customer_id, 10);
    const paymentAmount = parseFloat(amount);

    if (isNaN(customerId)) {
      return res.status(400).json({
        error: "Invalid Customer",
        message: "customer_id is required.",
      });
    }
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        error: "Invalid Amount",
        message: "amount must be greater than zero.",
      });
    }

    const customer = db
      .prepare("SELECT id FROM customers WHERE id = ?")
      .get(customerId);
    if (!customer) {
      return res.status(400).json({
        error: "Invalid Customer",
        message: "The specified customer does not exist.",
      });
    }

    const runPayment = db.transaction(() => {
      ensureCustomerAccount(customerId);
      db.prepare(`
        INSERT INTO ledger_entries (customer_id, entry_type, amount, note, user_id)
        VALUES (?, 'payment', ?, ?, ?)
      `).run(customerId, -paymentAmount, note || null, req.user.id);
      db.prepare(
        "UPDATE customer_accounts SET balance = balance - ? WHERE customer_id = ?",
      ).run(paymentAmount, customerId);
    });

    runPayment();

    const account = db
      .prepare("SELECT * FROM customer_accounts WHERE customer_id = ?")
      .get(customerId);
    res.status(200).json(account);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

app.post("/adjust", requirePermission("perm_transactions"), function (req, res) {
  try {
    const { customer_id, amount, note } = req.body;
    const customerId = parseInt(customer_id, 10);
    const adjustAmount = parseFloat(amount);

    if (isNaN(customerId)) {
      return res.status(400).json({
        error: "Invalid Customer",
        message: "customer_id is required.",
      });
    }
    if (isNaN(adjustAmount)) {
      return res.status(400).json({
        error: "Invalid Amount",
        message: "amount must be a number.",
      });
    }

    const customer = db
      .prepare("SELECT id FROM customers WHERE id = ?")
      .get(customerId);
    if (!customer) {
      return res.status(400).json({
        error: "Invalid Customer",
        message: "The specified customer does not exist.",
      });
    }

    const runAdjust = db.transaction(() => {
      ensureCustomerAccount(customerId);
      db.prepare(`
        INSERT INTO ledger_entries (customer_id, entry_type, amount, note, user_id)
        VALUES (?, 'adjustment', ?, ?, ?)
      `).run(customerId, adjustAmount, note || null, req.user.id);
      db.prepare(
        "UPDATE customer_accounts SET balance = balance + ? WHERE customer_id = ?",
      ).run(adjustAmount, customerId);
    });

    runAdjust();

    const account = db
      .prepare("SELECT * FROM customer_accounts WHERE customer_id = ?")
      .get(customerId);
    res.status(200).json(account);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});
