const app = require("express")();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const validator = require("validator");
const { db } = require("./db");

app.use(bodyParser.json());

module.exports = app;

/**
 * GET endpoint: Get the welcome message for the Users API.
 */
app.get("/", function (req, res) {
  res.send("Users API");
});

/**
 * GET endpoint: Get user details by user ID.
 */
app.get("/user/:userId", function (req, res) {
  if (!req.params.userId) {
    res.status(500).send("ID field is required.");
  } else {
    try {
      const user = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(parseInt(req.params.userId));
      res.send(user);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
});

/**
 * GET endpoint: Log out a user by updating the user status.
 */
app.get("/logout/:userId", function (req, res) {
  if (!req.params.userId) {
    res.status(500).send("ID field is required.");
  } else {
    try {
      const status = "Logged Out_" + new Date();
      db.prepare("UPDATE users SET status = ? WHERE id = ?").run(
        status,
        parseInt(req.params.userId),
      );
      res.sendStatus(200);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
});

/**
 * POST endpoint: Authenticate user login and update user status.
 */
app.post("/login", function (req, res) {
  try {
    const username = validator.escape(req.body.username);
    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);

    if (user) {
      bcrypt
        .compare(req.body.password, user.password)
        .then((result) => {
          if (result) {
            const status = "Logged In_" + new Date();
            db.prepare("UPDATE users SET status = ? WHERE id = ?").run(
              status,
              user.id,
            );
            res.send({ ...user, auth: true });
          } else {
            res.send({ auth: false });
          }
        })
        .catch((err) => res.send({ auth: false, message: err.message }));
    } else {
      res.send({ auth: false });
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * GET endpoint: Get details of all users.
 */
app.get("/all", function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;

  try {
    const count = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const users = db
      .prepare("SELECT * FROM users LIMIT ? OFFSET ?")
      .all(limit, skip);
    res.send({ data: users, total: count });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * DELETE endpoint: Delete a user by user ID.
 */
app.delete("/user/:userId", function (req, res) {
  try {
    db.prepare("DELETE FROM users WHERE id = ?").run(
      parseInt(req.params.userId),
    );
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * POST endpoint: Create or update a user.
 */
app.post("/post", function (req, res) {
  bcrypt
    .hash(req.body.password, saltRounds)
    .then((hash) => {
      const perms = [
        "perm_products",
        "perm_categories",
        "perm_transactions",
        "perm_users",
        "perm_settings",
      ];
      const userData = { ...req.body };

      for (const perm of perms) {
        if (userData[perm] !== undefined) {
          userData[perm] =
            userData[perm] === "on" || userData[perm] === 1 ? 1 : 0;
        } else if (userData.id === "") {
          userData[perm] = 0;
        }
      }

      if (userData.id === "") {
        const id = Math.floor(Date.now() / 1000);
        try {
          db.prepare(
            `
          INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          ).run(
            id,
            userData.username,
            userData.fullname,
            hash,
            userData.perm_products,
            userData.perm_categories,
            userData.perm_transactions,
            userData.perm_users,
            userData.perm_settings,
            "",
          );
          res.send({ id, ...userData });
        } catch (err) {
          res
            .status(500)
            .json({ error: "Internal Server Error", message: err.message });
        }
      } else {
        try {
          db.prepare(
            `
          UPDATE users SET 
            username = ?, fullname = ?, password = ?, 
            perm_products = ?, perm_categories = ?, perm_transactions = ?, 
            perm_users = ?, perm_settings = ?
          WHERE id = ?
        `,
          ).run(
            userData.username,
            userData.fullname,
            hash,
            userData.perm_products,
            userData.perm_categories,
            userData.perm_transactions,
            userData.perm_users,
            userData.perm_settings,
            parseInt(userData.id),
          );
          res.sendStatus(200);
        } catch (err) {
          res
            .status(500)
            .json({ error: "Internal Server Error", message: err.message });
        }
      }
    })
    .catch((err) =>
      res
        .status(500)
        .json({ error: "Internal Server Error", message: err.message }),
    );
});

/**
 * GET endpoint: Check and initialize the default admin user if not exists.
 */
app.get("/check", function (req, res) {
  try {
    const admin = db.prepare("SELECT * FROM users WHERE id = 1").get();
    if (!admin) {
      bcrypt.hash("admin", saltRounds).then((hash) => {
        db.prepare(
          `
          INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
          VALUES (1, 'admin', 'Administrator', ?, 1, 1, 1, 1, 1, '')
        `,
        ).run(hash);
      });
    }
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});
