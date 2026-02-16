const app = require("express")();
const bodyParser = require("body-parser");
const async = require("async");
const validator = require("validator");
const { db } = require("./db");

app.use(bodyParser.json());

module.exports = app;

/**
 * GET endpoint: Get the welcome message for the Inventory API.
 */
app.get("/", function (req, res) {
  res.send("Inventory API");
});

/**
 * GET endpoint: Get product details by product ID.
 */
app.get("/product/:productId", function (req, res) {
  if (!req.params.productId) {
    res.status(500).send("ID field is required.");
  } else {
    try {
      const product = db
        .prepare("SELECT * FROM inventory WHERE id = ?")
        .get(parseInt(req.params.productId));
      res.send(product);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
});

/**
 * GET endpoint: Get details of all products.
 */
app.get("/products", function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;
  let query = "SELECT * FROM inventory";
  let countQuery = "SELECT COUNT(*) as count FROM inventory";
  let params = [];

  if (req.query.q !== undefined && req.query.q !== "") {
    let searchTerm = `%${req.query.q}%`;
    let idSearch = parseInt(req.query.q);
    if (!isNaN(idSearch)) {
      query += " WHERE name LIKE ? OR id = ?";
      countQuery += " WHERE name LIKE ? OR id = ?";
      params = [searchTerm, idSearch];
    } else {
      query += " WHERE name LIKE ?";
      countQuery += " WHERE name LIKE ?";
      params = [searchTerm];
    }
  }

  try {
    const count = db.prepare(countQuery).get(...params).count;
    query += " ORDER BY id DESC LIMIT ? OFFSET ?";
    const products = db.prepare(query).all(...params, limit, skip);
    res.send({ data: products, total: count });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST endpoint: Create or update a product.
 */
app.post("/product", function (req, res) {
  try {
    let id = req.body.id ? req.body.id.toString() : "";
    let expirationDate = req.body.expirationDate
      ? validator.escape(req.body.expirationDate.toString())
      : "";
    let price = req.body.price ? parseFloat(req.body.price) : 0;
    let category = req.body.category
      ? validator.escape(req.body.category.toString())
      : "";
    let quantity = req.body.quantity ? parseInt(req.body.quantity) : 0;
    let name = req.body.name ? validator.escape(req.body.name.toString()) : "";
    let minStock = req.body.minStock ? parseInt(req.body.minStock) : 0;
    let generic = req.body.generic
      ? validator.escape(req.body.generic.toString())
      : "";
    let stock = req.body.stock === "on" ? 0 : 1;

    if (id === "") {
      const newId = Math.floor(Date.now() / 1000);
      db.prepare(
        `
        INSERT INTO inventory (id, name, generic, category, price, quantity, minStock, expirationDate, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        newId,
        name,
        generic,
        category,
        price,
        quantity,
        minStock,
        expirationDate,
        stock,
      );
      res.sendStatus(200);
    } else {
      db.prepare(
        `
        UPDATE inventory SET 
          name = ?, generic = ?, category = ?, 
          price = ?, quantity = ?, minStock = ?, 
          expirationDate = ?, stock = ?
        WHERE id = ?
      `,
      ).run(
        name,
        generic,
        category,
        price,
        quantity,
        minStock,
        expirationDate,
        stock,
        parseInt(id),
      );
      res.sendStatus(200);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * DELETE endpoint: Delete a product by product ID.
 */
app.delete("/product/:productId", function (req, res) {
  try {
    db.prepare("DELETE FROM inventory WHERE id = ?").run(
      parseInt(req.params.productId),
    );
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * Decrement inventory quantities based on a list of products in a transaction.
 */
app.decrementInventory = function (products) {
  const updateStmt = db.prepare(
    "UPDATE inventory SET quantity = quantity - ? WHERE id = ?",
  );
  const transaction = db.transaction((products) => {
    for (const product of products) {
      updateStmt.run(parseInt(product.quantity), parseInt(product.id));
    }
  });
  transaction(products);
};
