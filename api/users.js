/**
 * Users API - Secure Implementation
 * Handles user authentication, registration, and management
 */

const app = require("express")();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const saltRounds = 12; // Increased from 10 for better security
const { db, createSession, logAudit } = require("./db");

// Import middleware
const { requireAuth, requireAdmin } = require("../src/server/middleware/auth");
const {
  loginLimiter,
  strictLimiter,
} = require("../src/server/middleware/rateLimiter");
const {
  validateUserInput,
} = require("../src/server/validators/inputValidator");
const {
  validatePassword,
  checkPasswordStrength,
} = require("../src/server/validators/passwordValidator");
const {
  asyncHandler,
  AppError,
} = require("../src/server/middleware/errorHandler");

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
app.get(
  "/user/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      throw new AppError("Invalid user ID", 400, "INVALID_ID");
    }

    const user = db
      .prepare(
        "SELECT id, username, fullname, email, phone, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, created_at FROM users WHERE id = ?",
      )
      .get(userId);

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    res.send(user);
  }),
);

/**
 * GET endpoint: Log out a user by updating the user status.
 */
app.get(
  "/logout/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      throw new AppError("Invalid user ID", 400, "INVALID_ID");
    }

    const status = "Logged Out_" + new Date().toISOString();
    db.prepare(
      "UPDATE users SET status = ?, last_login = NULL WHERE id = ?",
    ).run(status, userId);

    // Delete user sessions
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

    // Log audit event
    logAudit(userId, "USER_LOGOUT", "users", userId);

    res.sendStatus(200);
  }),
);

/**
 * POST endpoint: Authenticate user login and update user status.
 */
app.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new AppError(
        "Username and password are required",
        400,
        "MISSING_CREDENTIALS",
      );
    }

    const sanitizedUsername = require("validator").escape(username.trim());
    const user = db
      .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
      .get(sanitizedUsername, sanitizedUsername);

    if (!user) {
      // Log failed attempt
      logAudit(null, "LOGIN_FAILED", "users", null, {
        identifier: sanitizedUsername,
      });
      return res
        .status(401)
        .json({ auth: false, message: "Invalid credentials" });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockExpiry = new Date(user.locked_until).toLocaleTimeString();
      return res.status(403).json({
        auth: false,
        message: `Account is locked until ${lockExpiry}. Too many failed attempts.`,
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      // Increment failed login attempts
      const attempts = (user.failed_login_attempts || 0) + 1;
      let lockedUntil = null;

      // Lock account after 5 failed attempts
      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        db.prepare(
          "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
        ).run(attempts, lockedUntil.toISOString(), user.id);

        logAudit(user.id, "ACCOUNT_LOCKED", "users", user.id);

        return res.status(403).json({
          auth: false,
          message:
            "Account locked due to too many failed attempts. Try again in 15 minutes.",
        });
      }

      db.prepare("UPDATE users SET failed_login_attempts = ? WHERE id = ?").run(
        attempts,
        user.id,
      );

      logAudit(user.id, "LOGIN_FAILED", "users", user.id);

      return res
        .status(401)
        .json({ auth: false, message: "Invalid credentials" });
    }

    // Check if password must be changed
    if (user.must_change_password) {
      return res.status(403).json({
        auth: false,
        mustChangePassword: true,
        message: "You must change your default password before continuing",
      });
    }

    // Login successful - reset failed attempts
    db.prepare(
      "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, status = ?, last_login = ? WHERE id = ?",
    ).run(
      "Logged In_" + new Date().toISOString(),
      new Date().toISOString(),
      user.id,
    );

    // Create session
    const session = createSession(user.id, req.ip, req.get("user-agent"));

    // Log audit event
    logAudit(user.id, "USER_LOGIN", "users", user.id);

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;

    res.send({
      ...userWithoutPassword,
      auth: true,
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
      },
    });
  }),
);

/**
 * GET endpoint: Get details of all users.
 */
app.get(
  "/all",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    let limit = parseInt(req.query.limit) || 10;
    let page = parseInt(req.query.page) || 1;
    let skip = (page - 1) * limit;

    // Limit max results to prevent abuse
    if (limit > 100) limit = 100;

    const count = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const users = db
      .prepare(
        "SELECT id, username, fullname, email, phone, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, last_login, created_at FROM users LIMIT ? OFFSET ?",
      )
      .all(limit, skip);

    res.send({ data: users, total: count });
  }),
);

/**
 * DELETE endpoint: Delete a user by user ID.
 */
app.delete(
  "/user/:userId",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      throw new AppError("Invalid user ID", 400, "INVALID_ID");
    }

    // Prevent deleting admin account
    if (userId === 1) {
      throw new AppError(
        "Cannot delete administrator account",
        403,
        "CANNOT_DELETE_ADMIN",
      );
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    // Log audit event
    logAudit(req.user.id, "USER_DELETED", "users", userId);

    res.sendStatus(200);
  }),
);

/**
 * POST endpoint: Create or update a user.
 */
app.post(
  "/post",
  requireAuth,
  strictLimiter,
  validateUserInput,
  validatePassword,
  asyncHandler(async (req, res) => {
    const userData = { ...req.body, ...req.sanitizedUser };

    // Hash password
    const hash = await bcrypt.hash(req.body.password, saltRounds);

    // Process permissions
    const perms = [
      "perm_products",
      "perm_categories",
      "perm_transactions",
      "perm_users",
      "perm_settings",
    ];

    for (const perm of perms) {
      if (userData[perm] !== undefined) {
        userData[perm] =
          userData[perm] === "on" || userData[perm] === 1 ? 1 : 0;
      } else if (!userData.id) {
        userData[perm] = 0;
      }
    }

    if (!userData.id || userData.id === "") {
      // Create new user
      const id = Math.floor(Date.now() / 1000);

      // Check if username already exists
      const existing = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(userData.username);
      if (existing) {
        throw new AppError("Username already exists", 409, "USERNAME_EXISTS");
      }

      db.prepare(
        `
      INSERT INTO users (id, username, fullname, password, email, phone, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        id,
        userData.username,
        userData.fullname,
        hash,
        userData.email || null,
        userData.phone || null,
        userData.perm_products,
        userData.perm_categories,
        userData.perm_transactions,
        userData.perm_users,
        userData.perm_settings,
        "",
        1, // Must change password on first login
      );

      // Log audit event
      logAudit(req.user.id, "USER_CREATED", "users", id);

      res
        .status(201)
        .send({ id, username: userData.username, fullname: userData.fullname });
    } else {
      // Update existing user
      const targetUserId = parseInt(userData.id);

      // Check if user exists
      const existing = db
        .prepare("SELECT id FROM users WHERE id = ?")
        .get(targetUserId);
      if (!existing) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      db.prepare(
        `
      UPDATE users SET
        username = ?, fullname = ?, password = ?, email = ?, phone = ?,
        perm_products = ?, perm_categories = ?, perm_transactions = ?,
        perm_users = ?, perm_settings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      ).run(
        userData.username,
        userData.fullname,
        hash,
        userData.email || null,
        userData.phone || null,
        userData.perm_products,
        userData.perm_categories,
        userData.perm_transactions,
        userData.perm_users,
        userData.perm_settings,
        targetUserId,
      );

      // Log audit event
      logAudit(req.user.id, "USER_UPDATED", "users", targetUserId);

      res.sendStatus(200);
    }
  }),
);

/**
 * GET endpoint: Check and initialize the default admin user if not exists.
 * This endpoint is public but only creates the admin if it doesn't exist
 */
app.get(
  "/check",
  asyncHandler(async (req, res) => {
    const admin = db.prepare("SELECT * FROM users WHERE id = 1").get();

    if (!admin) {
      // Generate a strong random password for initial admin
      const crypto = require("crypto");
      const tempPassword = crypto
        .randomBytes(8)
        .toString("base64")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 12);

      // Ensure password meets requirements
      const strongPassword = "Aa1!" + tempPassword; // Guaranteed to meet requirements

      const hash = await bcrypt.hash(strongPassword, saltRounds);

      db.prepare(
        `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password)
      VALUES (1, 'admin', 'Administrator', ?, 1, 1, 1, 1, 1, '', 1)
    `,
      ).run(hash);

      console.log(
        "Default admin user created. IMPORTANT: Password must be changed on first login.",
      );

      // In production, you would log this to a secure file or display it once
      if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
        console.log(`TEMPORARY ADMIN PASSWORD: ${strongPassword}`);
        console.log(
          "WARNING: This password will not be shown again. You must change it on first login.",
        );
      }
    }

    res.sendStatus(200);
  }),
);

/**
 * POST endpoint: Change user password
 */
app.post(
  "/change-password",
  requireAuth,
  validatePassword,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, userId } = req.body;

    const targetUserId = userId ? parseInt(userId) : req.user.id;

    // Get user
    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(targetUserId);

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    // Verify current password (except for admin resetting own password)
    if (targetUserId !== 1 || req.user.id !== 1) {
      const validPassword = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!validPassword) {
        throw new AppError(
          "Current password is incorrect",
          400,
          "INVALID_CURRENT_PASSWORD",
        );
      }
    }

    // Check if new password is same as current
    const samePassword = await bcrypt.compare(newPassword, user.password);
    if (samePassword) {
      throw new AppError(
        "New password must be different from current password",
        400,
        "SAME_PASSWORD",
      );
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    db.prepare(
      `
    UPDATE users 
    SET password = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `,
    ).run(newHash, targetUserId);

    // Log audit event
    logAudit(targetUserId, "PASSWORD_CHANGED", "users", targetUserId);

    res.send({ message: "Password changed successfully" });
  }),
);

/**
 * GET endpoint: Get current user's permissions
 */
app.get(
  "/me/permissions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = db
      .prepare(
        `
    SELECT perm_products, perm_categories, perm_transactions, perm_users, perm_settings 
    FROM users WHERE id = ?
  `,
      )
      .get(req.user.id);

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    res.send(user);
  }),
);
