const app = require("express")();
const bodyParser = require("body-parser");
const validator = require("validator");
const { db } = require("./db");

app.use(bodyParser.json());

module.exports = app;

/**
 * GET endpoint: Get the welcome message for the Customer API.
 */
app.get("/", function (req, res) {
  res.send("Customer API");
});

/**
 * GET endpoint: Get customer details by customer ID.
 */
app.get("/customer/:customerId", function (req, res) {
  if (!req.params.customerId) {
    res.status(500).send("ID field is required.");
  } else {
    try {
      const customer = db
        .prepare("SELECT * FROM customers WHERE id = ?")
        .get(parseInt(req.params.customerId));
      res.send(customer);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
});

/**
 * GET endpoint: Get details of all customers.
 */
app.get("/all", function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;

  try {
    const count = db
      .prepare("SELECT COUNT(*) as count FROM customers")
      .get().count;
    const customers = db
      .prepare("SELECT * FROM customers LIMIT ? OFFSET ?")
      .all(limit, skip);
    res.send({ data: customers, total: count });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST endpoint: Create a new customer.
 */
app.post("/customer", function (req, res) {
  try {
    const { name, phone, email, address } = req.body;
    db.prepare(
      `
      INSERT INTO customers (name, phone, email, address)
      VALUES (?, ?, ?, ?)
    `,
    ).run(name, phone, email, address);
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * DELETE endpoint: Delete a customer by customer ID.
 */
app.delete("/customer/:customerId", function (req, res) {
  try {
    db.prepare("DELETE FROM customers WHERE id = ?").run(
      parseInt(req.params.customerId),
    );
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * PUT endpoint: Update customer details.
 */
app.put("/customer", function (req, res) {
  try {
    const { id, name, phone, email, address } = req.body;
    db.prepare(
      `
      UPDATE customers SET 
        name = ?, phone = ?, email = ?, address = ?
      WHERE id = ?
    `,
    ).run(name, phone, email, address, parseInt(id));
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});
