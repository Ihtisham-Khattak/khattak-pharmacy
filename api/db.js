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

const db = new Database(dbPath);

/**
 * Initialize the database schema with professional refinements
 */
function initDB() {
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

    -- Inventory/Products Table
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY, -- Removed AUTOINCREMENT to allow manual ID insertion from code
      name TEXT NOT NULL,
      generic TEXT,
      category TEXT, -- Changed back from category_id for compatibility
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      minStock INTEGER DEFAULT 0,
      expirationDate TEXT,
      stock INTEGER DEFAULT 1,
      strength TEXT,
      form TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, -- Removed AUTOINCREMENT for consistency
      username TEXT UNIQUE NOT NULL,
      fullname TEXT,
      password TEXT NOT NULL,
      perm_products INTEGER DEFAULT 0,
      perm_categories INTEGER DEFAULT 0,
      perm_transactions INTEGER DEFAULT 0,
      perm_users INTEGER DEFAULT 0,
      perm_settings INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Transactions Table
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      till INTEGER,
      status INTEGER DEFAULT 1, -- 1: Completed, 0: Cancelled
      total REAL NOT NULL DEFAULT 0,
      paid REAL DEFAULT 0,
      change REAL DEFAULT 0,
      customer_id INTEGER,
      ref_number TEXT,
      items TEXT, -- JSON string of items
      payment_type TEXT,
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
  `);

  console.log("Database initialized successfully at:", dbPath);
}

module.exports = {
  db,
  initDB,
  dbPath,
};
