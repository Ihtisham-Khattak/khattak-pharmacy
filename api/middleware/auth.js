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
    is_active: user.is_active === undefined || user.is_active === null
      ? 1
      : user.is_active
        ? 1
        : 0,
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
 * Updates fields on an existing session (e.g. after password change).
 * @param {string} token
 * @param {object} patch
 */
function updateSession(token, patch) {
  const session = sessions.get(token);
  if (!session) return;
  Object.assign(session, patch);
}

function isPasswordChangeAllowedPath(req) {
  const url = req.originalUrl || req.url || "";
  return (
    /(?:^|\/)users\/change-password(?:\?|$|\/)/.test(url) ||
    /(?:^|\/)change-password(?:\?|$|\/)/.test(url) ||
    /(?:^|\/)users\/logout\//.test(url) ||
    /(?:^|\/)logout\//.test(url) ||
    /(?:^|\/)users\/user\//.test(url) ||
    /(?:^|\/)user\//.test(url)
  );
}

/**
 * Express middleware: requires a valid X-Access-Token header.
 * Sets req.user to the session object on success.
 * Blocks most routes when must_change_password is set.
 */
function requireAuth(req, res, next) {
  const token = req.headers["x-access-token"];
  const session = token ? sessions.get(token) : undefined;

  if (!session) {
    return res
      .status(401)
      .json({ error: "Unauthorized", message: "Not authenticated" });
  }

  if (session.is_active === 0) {
    destroySession(token);
    return res.status(403).json({
      error: "AccountInactive",
      message: "This account has been deactivated.",
    });
  }

  if (session.must_change_password && !isPasswordChangeAllowedPath(req)) {
    return res.status(403).json({
      error: "PasswordChangeRequired",
      message: "You must change your password before continuing.",
    });
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
  updateSession,
  requireAuth,
  requirePermission,
};
