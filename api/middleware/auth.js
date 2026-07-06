const crypto = require("crypto");

// In-memory session store: token -> safe user/session object.
// No hard expiry - this is a desktop app; sessions clear on server restart
// or explicit logout.
const sessions = new Map();

/**
 * Creates a new session for a successfully authenticated user.
 * @param {object} user - Full user row from the database (may include password).
 * @returns {{ token: string, user: object }} token and a safe (password-free) user object.
 */
function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const safeUser = {
    id: user.id,
    username: user.username,
    fullname: user.fullname,
    status: user.status,
    perm_products: user.perm_products,
    perm_categories: user.perm_categories,
    perm_transactions: user.perm_transactions,
    perm_users: user.perm_users,
    perm_settings: user.perm_settings,
    must_change_password: !!user.must_change_password,
  };
  sessions.set(token, safeUser);
  return { token, user: safeUser };
}

/**
 * Destroys a session, if it exists.
 * @param {string} token
 */
function destroySession(token) {
  if (token) {
    sessions.delete(token);
  }
}

/**
 * Retrieves the session object for a token, or undefined if not found.
 * @param {string} token
 * @returns {object|undefined}
 */
function getSession(token) {
  return sessions.get(token);
}

/**
 * Express middleware: requires a valid X-Access-Token header.
 * Sets req.user to the session object on success.
 */
function requireAuth(req, res, next) {
  const token = req.headers["x-access-token"];
  const session = token ? sessions.get(token) : undefined;

  if (!session) {
    return res
      .status(401)
      .json({ error: "Unauthorized", message: "Not authenticated" });
  }

  req.user = session;
  next();
}

/**
 * Express middleware factory: requires req.user[permKey] === 1.
 * Must run after requireAuth.
 * @param {string} permKey
 */
function requirePermission(permKey) {
  return function (req, res, next) {
    if (!req.user || req.user[permKey] !== 1) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
}

module.exports = {
  createSession,
  destroySession,
  getSession,
  requireAuth,
  requirePermission,
};
