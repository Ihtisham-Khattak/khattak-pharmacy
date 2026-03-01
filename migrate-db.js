/**
 * Database Migration Script
 * Fixes schema mismatches between the database and application code
 * 
 * Issues Fixed:
 * 1. inventory.category (TEXT) -> inventory.category_id (INTEGER)
 * 2. Add missing transactions.discount column
 * 3. Add missing transactions.tax column
 * 4. Add missing timestamps columns
 * 5. Enable foreign key support
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Use the data directory database
const dbPath = path.join(__dirname, "data", "pharmacy.db");

if (!fs.existsSync(dbPath)) {
  console.error("Database not found at:", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = OFF"); // Disable during migration

console.log("Starting database migration...");

try {
  db.exec(`
    -- Disable foreign keys during migration
    PRAGMA foreign_keys = OFF;

    -- Begin transaction for atomic migration
    BEGIN TRANSACTION;

    -- 1. Fix inventory table: rename category to category_id and change type
    -- Create temporary table with correct schema
    CREATE TABLE IF NOT EXISTS inventory_new (
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

    -- Copy data from old table to new table
    INSERT INTO inventory_new (id, name, generic, category_id, price, quantity, minStock, expirationDate, stock, strength, form)
    SELECT id, name, generic, 
           CASE 
             WHEN category IS NULL OR category = '' THEN NULL
             WHEN category GLOB '[0-9]*' THEN CAST(category AS INTEGER)
             ELSE NULL
           END as category_id,
           price, quantity, minStock, expirationDate, stock, strength, form
    FROM inventory;

    -- Drop old table
    DROP TABLE IF EXISTS inventory;

    -- Rename new table to original name
    ALTER TABLE inventory_new RENAME TO inventory;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category_id);

    -- 2. Fix transactions table: recreate with new columns
    CREATE TABLE IF NOT EXISTS transactions_new (
      id TEXT PRIMARY KEY,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      till INTEGER,
      status INTEGER DEFAULT 1,
      total REAL NOT NULL DEFAULT 0,
      paid REAL DEFAULT 0,
      change REAL DEFAULT 0,
      customer_id INTEGER,
      ref_number TEXT,
      items TEXT,
      payment_type TEXT,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- Copy data from old table to new table
    INSERT INTO transactions_new (id, date, user_id, till, status, total, paid, change, customer_id, ref_number, items, payment_type)
    SELECT id, date, user_id, till, status, total, paid, change, customer_id, ref_number, items, payment_type
    FROM transactions;

    -- Drop old table
    DROP TABLE IF EXISTS transactions;

    -- Rename new table to original name
    ALTER TABLE transactions_new RENAME TO transactions;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);

    -- 3. Fix categories table: add timestamps
    CREATE TABLE IF NOT EXISTS categories_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO categories_new (id, name)
    SELECT id, name FROM categories;

    DROP TABLE IF EXISTS categories;

    ALTER TABLE categories_new RENAME TO categories;

    -- 4. Fix customers table: add timestamps
    CREATE TABLE IF NOT EXISTS customers_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO customers_new (id, name, phone, email, address)
    SELECT id, name, phone, email, address FROM customers;

    DROP TABLE IF EXISTS customers;

    ALTER TABLE customers_new RENAME TO customers;

    -- 5. Fix users table: add timestamps
    CREATE TABLE IF NOT EXISTS users_new (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_new (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
    SELECT id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status FROM users;

    DROP TABLE IF EXISTS users;

    ALTER TABLE users_new RENAME TO users;

    -- 6. Create default admin user if not exists
    INSERT OR IGNORE INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
    VALUES (1, 'admin', 'Administrator', '$2b$10$YourHashedPasswordHere', 1, 1, 1, 1, 1, 'active');

    -- Commit transaction
    COMMIT;

    -- Verify foreign keys are enabled
    PRAGMA foreign_keys = ON;
  `);

  console.log("✓ Database migration completed successfully!");
  console.log("✓ Fixed inventory.category -> inventory.category_id");
  console.log("✓ Added transactions.discount column");
  console.log("✓ Added transactions.tax column");
  console.log("✓ Added timestamp columns to all tables");
  console.log("✓ Foreign key constraints enabled");

  // Verify the migration
  console.log("\nVerifying migration...");
  
  const inventoryColumns = db.pragma("table_info(inventory)");
  console.log("\nInventory table columns:");
  inventoryColumns.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  const transactionColumns = db.pragma("table_info(transactions)");
  console.log("\nTransactions table columns:");
  transactionColumns.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  const categoryColumns = db.pragma("table_info(categories)");
  console.log("\nCategories table columns:");
  categoryColumns.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  // Check foreign keys
  const foreignKeys = db.pragma("foreign_key_list(inventory)");
  if (foreignKeys.length > 0) {
    console.log("\nForeign keys on inventory table:");
    foreignKeys.forEach(fk => {
      console.log(`  - ${fk.from} -> ${fk.table}(${fk.to})`);
    });
  } else {
    console.log("\nℹ Note: Foreign keys will be enforced on new inserts/updates");
  }

} catch (err) {
  console.error("✗ Migration failed:", err.message);
  console.error("Rolling back...");
  try {
    db.exec("ROLLBACK;");
  } catch (e) {
    // Ignore rollback errors
  }
  process.exit(1);
} finally {
  db.close();
  console.log("\nDatabase connection closed.");
}
