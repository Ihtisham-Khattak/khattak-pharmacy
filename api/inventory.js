const app = require("express")();
const server = require("http").Server(app);
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const sanitizeFilename = require("sanitize-filename");
const validator = require("validator");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
  appData,
  appName,
  "server",
  "databases",
  "inventory.db",
);

app.use(bodyParser.json());

module.exports = app;

let inventoryDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

inventoryDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Inventory API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
  res.send("Inventory API");
});

/**
 * GET endpoint: Get product details by product ID.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/product/:productId", function (req, res) {
  if (!req.params.productId) {
    res.status(500).send("ID field is required.");
  } else {
    inventoryDB.findOne(
      {
        _id: parseInt(req.params.productId),
      },
      function (err, product) {
        res.send(product);
      },
    );
  }
});

/**
 * GET endpoint: Get details of all products.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/products", function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;
  let query = {};

  if (req.query.q != undefined && req.query.q != "") {
    let regex = new RegExp(req.query.q, "i");
    let idSearch = parseInt(req.query.q);
    if (!isNaN(idSearch)) {
      query = { $or: [{ name: regex }, { _id: idSearch }] };
    } else {
      query = { name: regex };
    }
  }

  inventoryDB.count(query, function (err, count) {
    if (err) {
      res.status(500).send(err);
    } else {
      inventoryDB
        .find(query)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
          if (err) {
            res.status(500).send(err);
          } else {
            res.send({ data: docs, total: count });
          }
        });
    }
  });
});

/**
 * POST endpoint: Create or update a product.
 *
 * @param {Object} req request object with product data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/product", function (req, res) {
  try {
    let id = req.body.id ? req.body.id.toString() : "";
    let expirationDate = req.body.expirationDate
      ? req.body.expirationDate.toString()
      : "";
    let price = req.body.price ? req.body.price.toString() : "0";
    let category = req.body.category ? req.body.category.toString() : "";
    let quantity = req.body.quantity ? req.body.quantity.toString() : "0";
    let name = req.body.name ? req.body.name.toString() : "";
    let minStock = req.body.minStock ? req.body.minStock.toString() : "0";
    let generic = req.body.generic ? req.body.generic.toString() : "";
    let stock = req.body.stock === "on" ? 0 : 1;

    let Product = {
      _id: id === "" ? Math.floor(Date.now() / 1000) : parseInt(id),
      expirationDate: validator.escape(expirationDate),
      price: validator.escape(price),
      category: validator.escape(category),
      quantity: validator.escape(quantity),
      name: validator.escape(name),
      stock: stock,
      minStock: validator.escape(minStock),
      generic: validator.escape(generic),
    };

    console.log("Processing Product Save:", Product);

    if (id === "") {
      inventoryDB.insert(Product, function (err, product) {
        if (err) {
          console.error("Insert Error:", err);
          res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        } else {
          console.log("Product Inserted:", product);
          res.sendStatus(200);
        }
      });
    } else {
      inventoryDB.update(
        {
          _id: parseInt(id),
        },
        Product,
        {},
        function (err, numReplaced, product) {
          if (err) {
            console.error("Update Error:", err);
            res.status(500).json({
              error: "Internal Server Error",
              message: "An unexpected error occurred.",
            });
          } else {
            console.log("Product Updated:", numReplaced);
            res.sendStatus(200);
          }
        },
      );
    }
  } catch (e) {
    console.error("Exception in POST /product:", e);
    res.status(500).send(e.toString());
  }
});

/**
 * DELETE endpoint: Delete a product by product ID.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/product/:productId", function (req, res) {
  inventoryDB.remove(
    {
      _id: parseInt(req.params.productId),
    },
    function (err, numRemoved) {
      if (err) {
        console.error(err);
        res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      } else {
        res.sendStatus(200);
      }
    },
  );
});

/**
 * Decrement inventory quantities based on a list of products in a transaction.
 *
 * @param {Array} products - List of products in the transaction.
 * @returns {void}
 */
app.decrementInventory = function (products) {
  async.eachSeries(products, function (transactionProduct, callback) {
    inventoryDB.findOne(
      {
        _id: parseInt(transactionProduct.id),
      },
      function (err, product) {
        if (!product || !product.quantity) {
          callback();
        } else {
          let updatedQuantity =
            parseInt(product.quantity) - parseInt(transactionProduct.quantity);

          inventoryDB.update(
            {
              _id: parseInt(product._id),
            },
            {
              $set: {
                quantity: updatedQuantity,
              },
            },
            {},
            callback,
          );
        }
      },
    );
  });
};
