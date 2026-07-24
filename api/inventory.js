const app = require("express")();
const bodyParser = require("body-parser");
const validator = require("validator");
const { db, ensureForeignKeysEnabled } = require("./db");
const { requireAuth, requirePermission } = require("./middleware/auth");

app.use(bodyParser.json());

// Ensure FK is enabled for every request
app.use(function (req, res, next) {
  ensureForeignKeysEnabled();
  next();
});

app.use(requireAuth);

/**
 * Synchronize the out of stock table when product quantities change.
 */
function syncOutOfStock(db, productId) {
  const product = db.prepare("SELECT * FROM inventory WHERE id = ?").get(productId);
  if (!product) {
    db.prepare("DELETE FROM out_of_stock_products WHERE product_id = ?").run(productId);
    return;
  }
  const isOutOfStock = product.quantity <= product.minStock;
  if (isOutOfStock) {
    const existing = db.prepare("SELECT id FROM out_of_stock_products WHERE product_id = ?").get(productId);
    if (existing) {
      db.prepare(`
        UPDATE out_of_stock_products SET
          product_name = ?,
          strength = ?,
          type = ?,
          minimum_quantity = ?,
          current_quantity = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(product.name, product.strength || null, product.form || null, product.minStock, product.quantity, existing.id);
    } else {
      db.prepare(`
        INSERT INTO out_of_stock_products (product_id, product_name, strength, type, minimum_quantity, current_quantity)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(product.id, product.name, product.strength || null, product.form || null, product.minStock, product.quantity);
    }
  } else {
    db.prepare("DELETE FROM out_of_stock_products WHERE product_id = ?").run(product.id);
  }
}

app.syncOutOfStock = syncOutOfStock;

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
  let where = [];

  if (req.query.q !== undefined && req.query.q !== "") {
    let searchTerm = `%${req.query.q}%`;
    let idSearch = parseInt(req.query.q);
    if (!isNaN(idSearch)) {
      where.push("(name LIKE ? OR generic LIKE ? OR id = ?)");
      params.push(searchTerm, searchTerm, idSearch);
    } else {
      where.push("(name LIKE ? OR generic LIKE ?)");
      params.push(searchTerm, searchTerm);
    }
  }

  if (req.query.category_id !== undefined && req.query.category_id !== "") {
    const categoryId = parseInt(req.query.category_id);
    if (!isNaN(categoryId) && categoryId > 0) {
      where.push("category_id = ?");
      params.push(categoryId);
    }
  }

  if (where.length) {
    const clause = " WHERE " + where.join(" AND ");
    query += clause;
    countQuery += clause;
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
app.post("/product", requirePermission("perm_products"), function (req, res) {
  try {
    let id = req.body.id ? req.body.id.toString() : "";
    let expirationDate = req.body.expirationDate
      ? validator.escape(req.body.expirationDate.toString())
      : "";
    let price = req.body.price ? parseFloat(req.body.price) : 0;
    let categoryStr = req.body.category
      ? validator.escape(req.body.category.toString())
      : "";
    let category =
      !categoryStr || categoryStr === "0" ? null : parseInt(categoryStr);
    let quantity = req.body.quantity ? parseInt(req.body.quantity) : 0;
    let name = req.body.name ? validator.escape(req.body.name.toString()) : "";
    let minStock = req.body.minStock ? parseInt(req.body.minStock) : 0;
    let generic = req.body.generic
      ? validator.escape(req.body.generic.toString())
      : "";
    let strength = req.body.strength
      ? validator.escape(req.body.strength.toString())
      : "";
    let form = req.body.form ? validator.escape(req.body.form.toString()) : "";
    let stock = req.body.stock === "on" ? 0 : 1;

    if (price < 0 || quantity < 0 || minStock < 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "price, quantity, and minStock must not be negative",
      });
    }

    if (id === "") {
      const result = db
        .prepare(
          `
        INSERT INTO inventory (name, generic, category_id, price, quantity, minStock, expirationDate, stock, strength, form)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          name,
          generic,
          category,
          price,
          quantity,
          minStock,
          expirationDate,
          stock,
          strength,
          form,
        );
      const newId = result.lastInsertRowid;
      syncOutOfStock(db, newId);
      res.sendStatus(200);
    } else {
      db.prepare(
        `
        UPDATE inventory SET 
          name = ?, generic = ?, category_id = ?, 
          price = ?, quantity = ?, minStock = ?, 
          expirationDate = ?, stock = ?, strength = ?, form = ?
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
        strength,
        form,
        parseInt(id),
      );
      syncOutOfStock(db, parseInt(id));
      res.sendStatus(200);
    }
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * DELETE endpoint: Delete a product by product ID.
 */
app.delete("/product/:productId", requirePermission("perm_products"), function (req, res) {
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
  // Ensure FK is enabled
  ensureForeignKeysEnabled();

  const updateStmt = db.prepare(
    "UPDATE inventory SET quantity = quantity - ? WHERE id = ? AND quantity >= ?",
  );
  const checkStmt = db.prepare(
    "SELECT id, name, quantity, category_id FROM inventory WHERE id = ?"
  );
  const categoryStmt = db.prepare(
    "SELECT id FROM categories WHERE id = ?"
  );

  const transaction = db.transaction((products) => {
    for (const product of products) {
      const productId = parseInt(product.id);
      const productQty = parseInt(product.quantity);

      // Validate product exists
      const invProduct = checkStmt.get(productId);
      if (!invProduct) {
        throw new Error(`Product with ID ${productId} not found in inventory`);
      }

      // Validate category exists if category_id is set
      if (invProduct.category_id) {
        const category = categoryStmt.get(invProduct.category_id);
        if (!category) {
          throw new Error(`Product "${invProduct.name}" has invalid category_id ${invProduct.category_id}`);
        }
      }

      const result = updateStmt.run(productQty, productId, productQty);
      if (result.changes === 0) {
        const current = checkStmt.get(productId);
        const currentQty = current ? current.quantity : 0;
        throw new Error(
          `Insufficient stock for product "${invProduct.name}": requested ${productQty} but only ${currentQty} available`,
        );
      }
      syncOutOfStock(db, productId);
    }
  });
  transaction(products);
};
