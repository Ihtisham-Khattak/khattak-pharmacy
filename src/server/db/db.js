/**
 * Database Configuration and Initialization
 * Secure SQLite database setup with improved schema
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Determine the persistent database path
let userDataPath;
try {
  userDataPath = app
    ? app.getPath("userData")
    : path.join(__dirname, "..", "..", "data");
} catch (e) {
  userDataPath = path.join(__dirname, "..", "..", "data");
}

const dbPath = path.join(userDataPath, "pharmacy.db");
const oldDbPath = path.join(__dirname, "..", "..", "data", "pharmacy.db");

/**
 * Ensure database directory exists
 */
function ensureDatabaseDirectory() {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('Created database directory:', dbDir);
    } catch (error) {
      console.error('Failed to create database directory:', error);
      throw error;
    }
  }
}

/**
 * Migrate database from old location to persistent location if necessary
 */
function migrateDatabase() {
  if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
    try {
      // Ensure the directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      fs.copyFileSync(oldDbPath, dbPath);
      console.log("Database migrated to persistent storage:", dbPath);
    } catch (error) {
      console.error("Failed to migrate database:", error);
    }
  }
}

// Ensure directory exists and migrate if needed
ensureDatabaseDirectory();
migrateDatabase();

// Initialize database with foreign keys enabled
let db;
try {
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL'); // Better performance and concurrency
} catch (error) {
  console.error("Failed to initialize database:", error);
  throw error;
}

/**
 * Initialize the database schema with security improvements and best practices
 */
function initDB() {
  db.exec(`
    -- Enable foreign key support
    PRAGMA foreign_keys = ON;
    
    -- Categories Table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers Table
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Inventory/Products Table
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      generic TEXT,
      category_id INTEGER,
      barcode TEXT UNIQUE,
      price REAL DEFAULT 0 CHECK(price >= 0),
      quantity INTEGER DEFAULT 0 CHECK(quantity >= 0),
      minStock INTEGER DEFAULT 0 CHECK(minStock >= 0),
      expirationDate TEXT,
      stock INTEGER DEFAULT 1,
      strength TEXT,
      form TEXT,
      manufacturer TEXT,
      batch_number TEXT,
      cost_price REAL DEFAULT 0 CHECK(cost_price >= 0),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      fullname TEXT,
      password TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      perm_products INTEGER DEFAULT 0,
      perm_categories INTEGER DEFAULT 0,
      perm_transactions INTEGER DEFAULT 0,
      perm_users INTEGER DEFAULT 0,
      perm_settings INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      must_change_password INTEGER DEFAULT 0,
      last_login DATETIME,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Sessions Table (for better authentication management)
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Password Reset Tokens Table
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Transactions Table
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      till INTEGER,
      status INTEGER DEFAULT 1,
      total REAL NOT NULL DEFAULT 0 CHECK(total >= 0),
      paid REAL DEFAULT 0 CHECK(paid >= 0),
      change REAL DEFAULT 0 CHECK(change >= 0),
      customer_id INTEGER,
      ref_number TEXT,
      items TEXT,
      payment_type TEXT DEFAULT 'Cash',
      discount REAL DEFAULT 0 CHECK(discount >= 0),
      tax REAL DEFAULT 0 CHECK(tax >= 0),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    -- Audit Log Table (for compliance and security)
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Settings Table
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      app TEXT,
      store TEXT,
      address_one TEXT,
      address_two TEXT,
      contact TEXT,
      email TEXT,
      tax REAL DEFAULT 0 CHECK(tax >= 0),
      symbol TEXT DEFAULT '$',
      percentage REAL DEFAULT 0,
      charge_tax INTEGER DEFAULT 0,
      footer TEXT,
      img TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_expiration ON inventory(expirationDate);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory(quantity);
    
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

    -- Create Triggers for updated_at timestamps
    CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
    AFTER UPDATE ON users BEGIN
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_inventory_timestamp 
    AFTER UPDATE ON inventory BEGIN
      UPDATE inventory SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_customers_timestamp 
    AFTER UPDATE ON customers BEGIN
      UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_categories_timestamp 
    AFTER UPDATE ON categories BEGIN
      UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_transactions_timestamp 
    AFTER UPDATE ON transactions BEGIN
      UPDATE transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    -- Audit trigger for users table (log password and permission changes)
    CREATE TRIGGER IF NOT EXISTS audit_users_update
    AFTER UPDATE ON users BEGIN
      INSERT INTO audit_log (user_id, action, table_name, record_id, old_value, new_value)
      SELECT 
        NEW.id,
        'USER_UPDATED',
        'users',
        NEW.id,
        json_object(
          'password', CASE WHEN OLD.password != NEW.password THEN '[CHANGED]' ELSE OLD.password END,
          'perm_products', OLD.perm_products,
          'perm_categories', OLD.perm_categories,
          'perm_transactions', OLD.perm_transactions,
          'perm_users', OLD.perm_users,
          'perm_settings', OLD.perm_settings
        ),
        json_object(
          'password', CASE WHEN OLD.password != NEW.password THEN '[CHANGED]' ELSE NEW.password END,
          'perm_products', NEW.perm_products,
          'perm_categories', NEW.perm_categories,
          'perm_transactions', NEW.perm_transactions,
          'perm_users', NEW.perm_users,
          'perm_settings', NEW.perm_settings
        )
      WHERE OLD.password != NEW.password 
         OR OLD.perm_products != NEW.perm_products
         OR OLD.perm_categories != NEW.perm_categories
         OR OLD.perm_transactions != NEW.perm_transactions
         OR OLD.perm_users != NEW.perm_users
         OR OLD.perm_settings != NEW.perm_settings;
    END;

    -- Audit trigger for inventory table
    CREATE TRIGGER IF NOT EXISTS audit_inventory_update
    AFTER UPDATE ON inventory BEGIN
      INSERT INTO audit_log (user_id, action, table_name, record_id, old_value, new_value)
      VALUES (
        NEW.id,
        'INVENTORY_UPDATED',
        'inventory',
        NEW.id,
        json_object('quantity', OLD.quantity, 'price', OLD.price),
        json_object('quantity', NEW.quantity, 'price', NEW.price)
      );
    END;

    -- Audit trigger for transactions
    CREATE TRIGGER IF NOT EXISTS audit_transactions_insert
    AFTER INSERT ON transactions BEGIN
      INSERT INTO audit_log (user_id, action, table_name, record_id, new_value)
      VALUES (
        NEW.user_id,
        'TRANSACTION_CREATED',
        'transactions',
        NEW.id,
        json_object('total', NEW.total, 'payment_type', NEW.payment_type)
      );
    END;
  `);

  console.log("Database initialized successfully at:", dbPath);
}

/**
 * Logs an audit event
 */
function logAudit(userId, action, tableName = null, recordId = null, newValue = null) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_log (user_id, action, table_name, record_id, new_value)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      userId,
      action,
      tableName,
      recordId,
      newValue ? JSON.stringify(newValue) : null
    );
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

/**
 * Creates a session for a user
 */
function createSession(userId, ipAddress = null, userAgent = null) {
  const crypto = require('crypto');
  const sessionId = crypto.randomBytes(32).toString('hex');
  const token = crypto.randomBytes(64).toString('hex');
  
  // Set expiration to 8 hours
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(sessionId, userId, token, ipAddress, userAgent, expiresAt);
  
  return { sessionId, token, expiresAt };
}

/**
 * Validates a session token
 */
function validateSession(token) {
  const session = db.prepare(`
    SELECT s.*, u.username, u.status 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  
  if (!session) {
    return null;
  }
  
  // Check if user is active
  if (session.status && session.status.startsWith('Logged Out')) {
    return null;
  }
  
  return session;
}

/**
 * Deletes expired sessions
 */
function cleanupExpiredSessions() {
  const stmt = db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  return stmt.run();
}

module.exports = {
  db,
  initDB,
  dbPath,
  logAudit,
  createSession,
  validateSession,
  cleanupExpiredSessions
};
