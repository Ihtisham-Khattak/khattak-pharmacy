const app = require("express")();
const bodyParser = require("body-parser");
const { db, ensureForeignKeysEnabled } = require("./db");
const { requireAuth, requirePermission } = require("./middleware/auth");

app.use(bodyParser.json());

// Ensure FK is enabled for every request
app.use(function (req, res, next) {
  ensureForeignKeysEnabled();
  next();
});

module.exports = app;

/**
 * GET endpoint: Get the welcome message for the Category API.
 */
app.get("/", function (req, res) {
  res.send("Category API");
});

// All routes below this point require authentication.
app.use(requireAuth);

/**
 * GET endpoint: Get details of all categories.
 */
app.get("/all", function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;
  let query = "SELECT * FROM categories";
  let countQuery = "SELECT COUNT(*) as count FROM categories";
  let params = [];

  if (req.query.q !== undefined && req.query.q !== "") {
    const searchTerm = `%${req.query.q}%`;
    query += " WHERE name LIKE ?";
    countQuery += " WHERE name LIKE ?";
    params.push(searchTerm);
  }

  try {
    const count = db.prepare(countQuery).get(...params).count;
    query += " ORDER BY name ASC LIMIT ? OFFSET ?";
    const categories = db.prepare(query).all(...params, limit, skip);
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
    res.status(400).send("ID missing");
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
app.post(
  "/category",
  requirePermission("perm_categories"),
  function (req, res) {
    try {
      db.prepare("INSERT INTO categories (name) VALUES (?)").run(
        req.body.name,
      );
      res.sendStatus(200);
    } catch (err) {
      res
        .status(500)
        .json({ error: "Internal Server Error", message: err.message });
    }
  },
);

/**
 * DELETE endpoint: Delete a category by category ID.
 */
app.delete(
  "/category/:categoryId",
  requirePermission("perm_categories"),
  function (req, res) {
    try {
      db.prepare("DELETE FROM categories WHERE id = ?").run(
        parseInt(req.params.categoryId),
      );
      res.sendStatus(200);
    } catch (err) {
      if (
        err.code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
        (err.message && err.message.includes("FOREIGN KEY constraint"))
      ) {
        return res.status(409).json({
          error: "Conflict",
          message:
            "This category cannot be deleted because it is still assigned to one or more products.",
        });
      }
      res
        .status(500)
        .json({ error: "Internal Server Error", message: err.message });
    }
  },
);

/**
 * PUT endpoint: Update category details.
 */
app.put(
  "/category",
  requirePermission("perm_categories"),
  function (req, res) {
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
  },
);
