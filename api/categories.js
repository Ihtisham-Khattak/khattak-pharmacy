const app = require("express")();
const bodyParser = require("body-parser");
const { db } = require("./db");

app.use(bodyParser.json());

module.exports = app;

/**
 * GET endpoint: Get the welcome message for the Category API.
 */
app.get("/", function (req, res) {
  res.send("Category API");
});

/**
 * GET endpoint: Get details of all categories.
 */
app.get("/all", function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;

  try {
    const count = db
      .prepare("SELECT COUNT(*) as count FROM categories")
      .get().count;
    const categories = db
      .prepare("SELECT * FROM categories LIMIT ? OFFSET ?")
      .all(limit, skip);
    res.send({ data: categories, total: count });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * GET endpoint: Get a category by ID.
 */
app.get("/category/:categoryId", function (req, res) {
  if (!req.params.categoryId) {
    res.status(500).send("ID missing");
  } else {
    try {
      const category = db
        .prepare("SELECT * FROM categories WHERE id = ?")
        .get(parseInt(req.params.categoryId));
      res.send(category);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
});

/**
 * POST endpoint: Create a new category.
 */
app.post("/category", function (req, res) {
  try {
    const id = Math.floor(Date.now() / 1000);
    db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(
      id,
      req.body.name,
    );
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * DELETE endpoint: Delete a category by category ID.
 */
app.delete("/category/:categoryId", function (req, res) {
  try {
    db.prepare("DELETE FROM categories WHERE id = ?").run(
      parseInt(req.params.categoryId),
    );
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * PUT endpoint: Update category details.
 */
app.put("/category", function (req, res) {
  try {
    db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(
      req.body.name,
      parseInt(req.body.id),
    );
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});
