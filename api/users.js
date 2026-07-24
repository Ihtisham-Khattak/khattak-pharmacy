const app = require("express")();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const saltRounds = 10;
const validator = require("validator");
const { db, ensureForeignKeysEnabled } = require("./db");
const {
  createSession,
  destroySession,
  updateSession,
  requireAuth,
  requirePermission,
} = require("./middleware/auth");

function isUserActive(user) {
  if (user.is_active === undefined || user.is_active === null) return true;
  return Number(user.is_active) === 1;
}

app.use(bodyParser.json());

// Ensure FK is enabled for every request
app.use(function (req, res, next) {
  ensureForeignKeysEnabled();
  next();
});

module.exports = app;

// Columns safe to return to clients - NEVER includes password.
const SAFE_USER_COLUMNS =
  "id, username, fullname, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password, is_active, created_at, updated_at";

/**
 * GET endpoint: Get the welcome message for the Users API.
 */
app.get("/", function (req, res) {
  res.send("Users API");
});

/**
 * POST endpoint: Authenticate user login and update user status.
 * PUBLIC route - no auth required (this is how a token is obtained).
 */
app.post("/login", function (req, res) {
  try {
    const username = validator.escape(req.body.username);
    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);

    if (user) {
      if (!isUserActive(user)) {
        return res.send({
          auth: false,
          error: "AccountInactive",
          message: "This account has been deactivated. Contact an administrator.",
        });
      }
      bcrypt
        .compare(req.body.password, user.password)
        .then((result) => {
          if (result) {
            const status = "Logged In_" + new Date();
            db.prepare("UPDATE users SET status = ? WHERE id = ?").run(
              status,
              user.id,
            );
            const { token, user: safeUser } = createSession(user);
            res.send({
              auth: true,
              token,
              user: {
                id: safeUser.id,
                username: safeUser.username,
                fullname: safeUser.fullname,
                status,
                perm_products: safeUser.perm_products,
                perm_categories: safeUser.perm_categories,
                perm_transactions: safeUser.perm_transactions,
                perm_users: safeUser.perm_users,
                perm_settings: safeUser.perm_settings,
                must_change_password: !!user.must_change_password,
                is_active: safeUser.is_active,
              },
            });
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
 * GET endpoint: Check and initialize the default admin user if not exists.
 * PUBLIC route - no auth required (must work before any user can log in).
 * Idempotent - only seeds if no admin (id=1) exists.
 */
app.get("/check", async function (req, res) {
  try {
    const admin = db.prepare("SELECT * FROM users WHERE id = 1").get();
    if (!admin) {
      const plainPassword = crypto.randomBytes(12).toString("base64url");
      const hash = await bcrypt.hash(plainPassword, saltRounds);
      db.prepare(
        `
        INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password)
        VALUES (1, 'admin', 'Administrator', ?, 1, 1, 1, 1, 1, '', 1)
      `,
      ).run(hash);
      console.log(
        "[PharmaSpot] Generated initial admin password (change immediately after first login): " +
          plainPassword,
      );
    }
    res.sendStatus(200);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// Everything below this point requires authentication.
app.use(requireAuth);

/**
 * POST endpoint: Change the current user's password.
 * Allowed even when must_change_password is set (auth middleware whitelist).
 */
app.post("/change-password", function (req, res) {
  const currentPassword = req.body.current_password;
  const newPassword = req.body.new_password;

  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({
      error: "Bad Request",
      message: "New password must be at least 6 characters.",
    });
  }

  try {
    const row = db
      .prepare("SELECT id, password FROM users WHERE id = ?")
      .get(req.user.id);
    if (!row) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found.",
      });
    }

    const finish = (hash) => {
      db.prepare(
        "UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?",
      ).run(hash, req.user.id);
      const token = req.headers["x-access-token"];
      updateSession(token, { must_change_password: false });
      res.sendStatus(200);
    };

    if (req.user.must_change_password && !currentPassword) {
      bcrypt
        .hash(String(newPassword), saltRounds)
        .then(finish)
        .catch((err) =>
          res
            .status(500)
            .json({ error: "Internal Server Error", message: err.message }),
        );
      return;
    }

    if (!currentPassword) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Current password is required.",
      });
    }

    bcrypt
      .compare(String(currentPassword), row.password)
      .then((ok) => {
        if (!ok) {
          return res.status(400).json({
            error: "Invalid Password",
            message: "Current password is incorrect.",
          });
        }
        return bcrypt.hash(String(newPassword), saltRounds).then(finish);
      })
      .catch((err) =>
        res
          .status(500)
          .json({ error: "Internal Server Error", message: err.message }),
      );
  } catch (err) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

/**
 * GET endpoint: Get user details by user ID.
 * Allowed if the caller is viewing their own profile, or has perm_users.
 */
app.get("/user/:userId", function (req, res) {
  if (!req.params.userId) {
    res.status(500).send("ID field is required.");
  } else {
    const requestedId = parseInt(req.params.userId);
    if (req.user.id !== requestedId && req.user.perm_users !== 1) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      });
    }
    try {
      const user = db
        .prepare(`SELECT ${SAFE_USER_COLUMNS} FROM users WHERE id = ?`)
        .get(requestedId);
      res.send(user);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
});

/**
 * GET endpoint: Log out a user by updating the user status and destroying
 * their session (identified via the X-Access-Token header).
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
      destroySession(req.headers["x-access-token"]);
      res.sendStatus(200);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
});

/**
 * GET endpoint: Get details of all users.
 */
app.get("/all", requirePermission("perm_users"), function (req, res) {
  let limit = parseInt(req.query.limit) || 10;
  let page = parseInt(req.query.page) || 1;
  let skip = (page - 1) * limit;

  try {
    const count = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const users = db
      .prepare(`SELECT ${SAFE_USER_COLUMNS} FROM users LIMIT ? OFFSET ?`)
      .all(limit, skip);
    res.send({ data: users, total: count });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * DELETE endpoint: Delete a user by user ID.
 */
app.delete(
  "/user/:userId",
  requirePermission("perm_users"),
  function (req, res) {
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(
        parseInt(req.params.userId),
      );
      res.sendStatus(200);
    } catch (err) {
      const isForeignKeyError =
        (err.message && err.message.includes("FOREIGN KEY constraint")) ||
        err.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
      if (isForeignKeyError) {
        return res.status(409).json({
          error: "Conflict",
          message:
            "This user cannot be deleted because they have existing transaction records. Consider deactivating them instead.",
        });
      }
      res
        .status(500)
        .json({ error: "Internal Server Error", message: err.message });
    }
  },
);

/**
 * POST endpoint: Create or update a user.
 * Allowed if the caller has perm_users, OR is updating their own account
 * (self-service edit - in that case perm_* fields are ignored/stripped).
 */
app.post("/post", function (req, res) {
  const userData = { ...req.body };
  const isSelfEdit =
    userData.id !== "" &&
    userData.id !== undefined &&
    parseInt(userData.id) === req.user.id;

  if (req.user.perm_users !== 1 && !isSelfEdit) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission to perform this action",
    });
  }

  // Self-service edits (without perm_users) may not change permission columns.
  const restrictToSelfServiceFields = req.user.perm_users !== 1 && isSelfEdit;

  if (restrictToSelfServiceFields) {
    delete userData.is_active;
  } else if (userData.is_active !== undefined) {
    userData.is_active =
      userData.is_active === "on" ||
      userData.is_active === 1 ||
      userData.is_active === "1" ||
      userData.is_active === true
        ? 1
        : 0;
  } else if (userData.id === "") {
    userData.is_active = 1;
  }

  const perms = [
    "perm_products",
    "perm_categories",
    "perm_transactions",
    "perm_users",
    "perm_settings",
  ];

  if (restrictToSelfServiceFields) {
    for (const perm of perms) {
      delete userData[perm];
    }
  }

  for (const perm of perms) {
    if (userData[perm] !== undefined) {
      userData[perm] =
        userData[perm] === "on" || userData[perm] === 1 ? 1 : 0;
    } else if (userData.id === "") {
      userData[perm] = 0;
    }
  }

  const hasNewPassword =
    req.body.password !== undefined &&
    req.body.password !== null &&
    req.body.password !== "";

  const applyPassword = (hash) => {
    if (userData.id === "") {
      try {
        const result = db
          .prepare(
            `
          INSERT INTO users (username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            userData.username,
            userData.fullname,
            hash,
            userData.perm_products,
            userData.perm_categories,
            userData.perm_transactions,
            userData.perm_users,
            userData.perm_settings,
            "",
            0,
            userData.is_active !== undefined ? userData.is_active : 1,
          );
        res.send({ id: result.lastInsertRowid, ...userData });
      } catch (err) {
        res
          .status(500)
          .json({ error: "Internal Server Error", message: err.message });
      }
    } else {
      try {
        // Self-service edits (without perm_users) must NOT touch the perm_*
        // columns at all - userData.perm_* is undefined/deleted for those
        // edits (see restrictToSelfServiceFields above), and binding
        // undefined would silently NULL out the editing user's own
        // permissions. Only include perm_* in the SET clause for
        // admin-performed edits.
        const permClause = restrictToSelfServiceFields
          ? ""
          : "perm_products = ?, perm_categories = ?, perm_transactions = ?, perm_users = ?, perm_settings = ?,";
        const permValues = restrictToSelfServiceFields
          ? []
          : [
              userData.perm_products,
              userData.perm_categories,
              userData.perm_transactions,
              userData.perm_users,
              userData.perm_settings,
            ];
        const activeClause = restrictToSelfServiceFields
          ? ""
          : ", is_active = ?";
        const activeValues = restrictToSelfServiceFields
          ? []
          : [
              userData.is_active !== undefined ? userData.is_active : 1,
            ];

        if (hash !== undefined) {
          db.prepare(
            `
            UPDATE users SET
              username = ?, fullname = ?, password = ?,
              ${permClause} must_change_password = 0
              ${activeClause}
            WHERE id = ?
          `,
          ).run(
            userData.username,
            userData.fullname,
            hash,
            ...permValues,
            ...activeValues,
            parseInt(userData.id),
          );
        } else {
          // No new password provided - keep existing hash untouched.
          db.prepare(
            `
            UPDATE users SET
              username = ?, fullname = ?
              ${permClause ? "," + permClause.slice(0, -1) : ""}
              ${activeClause}
            WHERE id = ?
          `,
          ).run(
            userData.username,
            userData.fullname,
            ...permValues,
            ...activeValues,
            parseInt(userData.id),
          );
        }
        res.sendStatus(200);
      } catch (err) {
        res
          .status(500)
          .json({ error: "Internal Server Error", message: err.message });
      }
    }
  };

  if (hasNewPassword) {
    bcrypt
      .hash(req.body.password, saltRounds)
      .then((hash) => applyPassword(hash))
      .catch((err) =>
        res
          .status(500)
          .json({ error: "Internal Server Error", message: err.message }),
      );
  } else if (userData.id === "") {
    // New users must have a password.
    res.status(400).json({
      error: "Bad Request",
      message: "Password is required to create a new user.",
    });
  } else {
    applyPassword(undefined);
  }
});
