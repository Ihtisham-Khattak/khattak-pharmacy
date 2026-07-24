const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Determine the persistent database path
let userDataPath;
try {
  userDataPath = app
    ? app.getPath("userData")
    : path.join(__dirname, "..", "data");
} catch (e) {
  userDataPath = path.join(__dirname, "..", "data");
}

const dbPath = path.join(userDataPath, "pharmacy.db");
const oldDbPath = path.join(__dirname, "..", "data", "pharmacy.db");

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

migrateDatabase();

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign key constraints - MUST be set on every connection
function ensureForeignKeysEnabled() {
  db.pragma("foreign_keys = ON");
  const status = db.pragma("foreign_keys");
  return status[0].foreign_keys === 1;
}

// Enable FK on module load
ensureForeignKeysEnabled();

// Ensure FK is enabled before every prepare/exec operation
const originalPrepare = db.prepare.bind(db);
const originalExec = db.exec.bind(db);

db.prepare = function (sql) {
  ensureForeignKeysEnabled();
  return originalPrepare(sql);
};

db.exec = function (sql) {
  ensureForeignKeysEnabled();
  return originalExec(sql);
};

/**
 * Initialize the database schema with professional refinements
 */
function initDB() {
  // Ensure foreign keys are enabled before schema operations
  const fkEnabled = ensureForeignKeysEnabled();
  console.log("Foreign keys enabled:", fkEnabled ? "YES ✓" : "NO ✗");

  db.exec(`
    -- Categories Table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers Table
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default walk-in customer (id=0) if not exists
    INSERT OR IGNORE INTO customers (id, name, created_at, updated_at)
    VALUES (0, 'Walk-in Customer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    -- Inventory/Products Table
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      generic TEXT,
      category_id INTEGER,
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      minStock INTEGER DEFAULT 0,
      expirationDate TEXT,
      stock INTEGER DEFAULT 1,
      strength TEXT,
      form TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      fullname TEXT,
      password TEXT NOT NULL,
      perm_products INTEGER DEFAULT 0,
      perm_categories INTEGER DEFAULT 0,
      perm_transactions INTEGER DEFAULT 0,
      perm_users INTEGER DEFAULT 0,
      perm_settings INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      must_change_password INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Transactions Table
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      till INTEGER,
      status INTEGER DEFAULT 1,
      total REAL NOT NULL DEFAULT 0,
      paid REAL DEFAULT 0,
      change REAL DEFAULT 0,
      customer_id INTEGER DEFAULT 0,
      ref_number TEXT,
      hold_customer_name TEXT DEFAULT '',
      hold_customer_phone TEXT DEFAULT '',
      items TEXT,
      payment_type TEXT,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- Settings Table
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      app TEXT,
      store TEXT,
      address_one TEXT,
      address_two TEXT,
      contact TEXT,
      tax REAL DEFAULT 0,
      symbol TEXT DEFAULT '$',
      percentage REAL DEFAULT 0,
      charge_tax INTEGER DEFAULT 0,
      footer TEXT,
      img TEXT,
      allow_lan_access INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Out of Stock Products Table
    CREATE TABLE IF NOT EXISTS out_of_stock_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      strength TEXT,
      type TEXT,
      minimum_quantity INTEGER NOT NULL DEFAULT 0,
      current_quantity INTEGER NOT NULL DEFAULT 0,
      reorder_quantity INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE
    );

    -- Create Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_out_of_stock_product ON out_of_stock_products(product_id);
    CREATE INDEX IF NOT EXISTS idx_out_of_stock_quantity ON out_of_stock_products(current_quantity);
  `);

  // Idempotent migrations for columns added after the initial CREATE TABLE
  // statements above shipped. CREATE TABLE IF NOT EXISTS only applies to
  // brand-new databases, so existing databases need explicit ALTER TABLE
  // migrations. SQLite has no "ADD COLUMN IF NOT EXISTS", so we check
  // PRAGMA table_info() first and only ALTER when the column is missing.
  addColumnIfMissing("users", "must_change_password", "INTEGER DEFAULT 0");
  addColumnIfMissing("settings", "allow_lan_access", "INTEGER DEFAULT 0");
  addColumnIfMissing("transactions", "hold_customer_name", "TEXT DEFAULT ''");
  addColumnIfMissing("transactions", "hold_customer_phone", "TEXT DEFAULT ''");
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_transactions_ref_number ON transactions(ref_number)",
    );
  } catch (err) {
    console.error("Migration failed: idx_transactions_ref_number:", err.message);
  }

  console.log("Database initialized successfully at:", dbPath);
}

/**
 * Add a column to an existing table if it does not already exist.
 * Safe to call repeatedly (e.g. on every app startup).
 */
function addColumnIfMissing(table, column, definition) {
  try {
    const columns = db.pragma(`table_info(${table})`);
    const exists = columns.some((col) => col.name === column);
    if (!exists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`Migration: added column ${table}.${column}`);
    }
  } catch (err) {
    console.error(
      `Migration failed: could not add column ${table}.${column}:`,
      err.message
    );
  }
}

module.exports = {
  db,
  initDB,
  dbPath,
  ensureForeignKeysEnabled,
};
