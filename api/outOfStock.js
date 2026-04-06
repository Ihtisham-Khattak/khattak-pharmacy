const app = require("express")();
const bodyParser = require("body-parser");
const { db, ensureForeignKeysEnabled } = require("./db");

app.use(bodyParser.json());

// Ensure FK is enabled for every request
app.use(function (req, res, next) {
  ensureForeignKeysEnabled();
  next();
});

/**
 * GET endpoint: Get details of all out-of-stock products
 */
app.get("/", function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;
  let query = "SELECT * FROM out_of_stock_products";
  let countQuery = "SELECT COUNT(*) as count FROM out_of_stock_products";
  let params = [];
  let conditions = [];

  // Search filter
  if (req.query.q !== undefined && req.query.q !== "") {
    let searchTerm = `%${req.query.q}%`;
    conditions.push("(product_name LIKE ?)");
    params.push(searchTerm);
  }

  // Type filter
  if (req.query.type !== undefined && req.query.type !== "") {
    conditions.push("type = ?");
    params.push(req.query.type);
  }

  if (conditions.length > 0) {
    let whereClause = " WHERE " + conditions.join(" AND ");
    query += whereClause;
    countQuery += whereClause;
  }

  // Sorting
  let sortField = "current_quantity";
  let sortDirection = "ASC";
  if (req.query.sort === "lowest_first") {
    sortDirection = "ASC";
  } else if (req.query.sort === "highest_first") {
    sortDirection = "DESC";
  }

  try {
    const count = db.prepare(countQuery).get(...params).count;
    query += ` ORDER BY ${sortField} ${sortDirection} LIMIT ? OFFSET ?`;
    const products = db.prepare(query).all(...params, limit, skip);
    res.send({ data: products, total: count });
  } catch (err) {
    res.status(500).send({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * PUT endpoint: Update reorder quantity
 */
app.put("/:id", function (req, res) {
  let id = parseInt(req.params.id);
  let reorder_quantity = req.body.reorder_quantity ? parseInt(req.body.reorder_quantity) : null;

  try {
    db.prepare(`
      UPDATE out_of_stock_products
      SET reorder_quantity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reorder_quantity, id);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * POST endpoint: Alternative route to update reorder quantity
 */
app.post("/reorder", function (req, res) {
  let id = req.body.id ? parseInt(req.body.id) : null;
  let reorder_quantity = req.body.reorder_quantity ? parseInt(req.body.reorder_quantity) : null;

  if (!id) {
    return res.status(400).send({ error: "Bad Request", message: "ID is required" });
  }

  try {
    db.prepare(`
      UPDATE out_of_stock_products
      SET reorder_quantity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reorder_quantity, id);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send({ error: "Internal Server Error", message: err.message });
  }
});

module.exports = app;
