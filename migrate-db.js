/**
 * Database Migration Script
 * Fixes schema mismatches between the database and application code
 *
 * Issues Fixed:
 * 1. inventory.category (TEXT) -> inventory.category_id (INTEGER), preserving
 *    any non-numeric category text by creating/matching a row in `categories`
 * 2. Add missing transactions.discount column
 * 3. Add missing transactions.tax column
 * 4. Add missing timestamps columns
 * 5. Enable foreign key support
 *
 * Safety:
 * - Takes a full file-level backup of the database before making any
 *   destructive changes.
 * - Detects whether the migration has already been applied (idempotent) and
 *   skips instead of re-running destructive DROP/rebuild logic.
 * - Runs PRAGMA foreign_key_check before COMMIT and aborts on violations.
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

// ---------------------------------------------------------------------------
// Step 0: Determine whether migration is needed (idempotency check)
// ---------------------------------------------------------------------------
// This is a real, standalone Node script run against a real filesystem
// outside of any workflow/test sandbox, so using new Date() for the backup
// filename here is fine and expected.
const probeDb = new Database(dbPath, { readonly: true });
const inventoryColumnsProbe = probeDb.pragma("table_info(inventory)");
probeDb.close();

const hasOldCategoryColumn = inventoryColumnsProbe.some(
  (col) => col.name === "category"
);
const hasNewCategoryIdColumn = inventoryColumnsProbe.some(
  (col) => col.name === "category_id"
);

if (!hasOldCategoryColumn && hasNewCategoryIdColumn) {
  console.log(
    "Migration already applied (inventory.category_id exists, old inventory.category column is gone). Skipping."
  );
  process.exit(0);
}

if (!hasOldCategoryColumn && !hasNewCategoryIdColumn) {
  console.error(
    "Unexpected schema: inventory table has neither 'category' nor 'category_id' column. Aborting to avoid making things worse."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: Take a pre-migration backup BEFORE opening any transaction
// ---------------------------------------------------------------------------
const backupTimestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");
const backupPath = `${dbPath}.pre-migration-backup-${backupTimestamp}.bak`;

try {
  fs.copyFileSync(dbPath, backupPath);
  console.log("Pre-migration backup created at:", backupPath);
} catch (err) {
  console.error("Failed to create pre-migration backup:", err.message);
  console.error("Aborting migration - refusing to proceed without a backup.");
  process.exit(1);
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = OFF"); // Disable during migration

console.log("Starting database migration...");

// Track category creation/mapping for the end-of-run summary
const categorySummary = {
  createdCount: 0,
  matchedExistingCount: 0,
  nullCount: 0,
  created: [],
};

let inTransaction = false;

try {
  db.pragma("foreign_keys = OFF");

  db.exec("BEGIN TRANSACTION");
  inTransaction = true;

  // ---------------------------------------------------------------------
  // 1. Fix inventory table: rename category to category_id and change type
  //    WITHOUT discarding non-numeric category text.
  // ---------------------------------------------------------------------

  // Build a map of old free-text category values -> categories.id, creating
  // rows in `categories` for any value that doesn't already exist there.
  const distinctCategories = db
    .prepare(
      `SELECT DISTINCT category FROM inventory
       WHERE category IS NOT NULL AND TRIM(category) != ''`
    )
    .all()
    .map((row) => row.category);

  const findCategoryByName = db.prepare(
    "SELECT id FROM categories WHERE name = ? COLLATE NOCASE"
  );
  const insertCategory = db.prepare(
    "INSERT INTO categories (name, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  );

  // categoryValueToId maps the raw old `category` text (as stored) -> id
  const categoryValueToId = new Map();

  for (const rawValue of distinctCategories) {
    const trimmed = String(rawValue).trim();

    // Purely numeric values are assumed to already be category ids (this
    // matches the previous migration's behavior for numeric values).
    if (/^[0-9]+$/.test(trimmed)) {
      categoryValueToId.set(rawValue, parseInt(trimmed, 10));
      continue;
    }

    // Non-numeric text: find or create a matching row in `categories`.
    const existing = findCategoryByName.get(trimmed);
    if (existing) {
      categoryValueToId.set(rawValue, existing.id);
      categorySummary.matchedExistingCount++;
    } else {
      const result = insertCategory.run(trimmed);
      const newId = result.lastInsertRowid;
      categoryValueToId.set(rawValue, newId);
      categorySummary.createdCount++;
      categorySummary.created.push({ name: trimmed, id: newId });
    }
  }

  // Create temporary table with correct schema
  db.exec(`
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
  `);

  const insertInventoryNew = db.prepare(`
    INSERT INTO inventory_new (id, name, generic, category_id, price, quantity, minStock, expirationDate, stock, strength, form)
    VALUES (@id, @name, @generic, @category_id, @price, @quantity, @minStock, @expirationDate, @stock, @strength, @form)
  `);

  const oldInventoryRows = db.prepare("SELECT * FROM inventory").all();
  for (const row of oldInventoryRows) {
    const rawCategory = row.category;
    let categoryId = null;

    if (rawCategory !== null && String(rawCategory).trim() !== "") {
      if (categoryValueToId.has(rawCategory)) {
        categoryId = categoryValueToId.get(rawCategory);
      } else {
        // Shouldn't happen since we built the map from DISTINCT values above,
        // but guard defensively.
        categorySummary.nullCount++;
      }
    } else {
      categorySummary.nullCount++;
    }

    insertInventoryNew.run({
      id: row.id,
      name: row.name,
      generic: row.generic ?? null,
      category_id: categoryId,
      price: row.price ?? 0,
      quantity: row.quantity ?? 0,
      minStock: row.minStock ?? 0,
      expirationDate: row.expirationDate ?? null,
      stock: row.stock ?? 1,
      strength: row.strength ?? null,
      form: row.form ?? null,
    });
  }

  // Drop old table
  db.exec("DROP TABLE IF EXISTS inventory");

  // Rename new table to original name
  db.exec("ALTER TABLE inventory_new RENAME TO inventory");

  // Recreate indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category_id);
  `);

  // ---------------------------------------------------------------------
  // 2. Fix transactions table: recreate with new columns
  // ---------------------------------------------------------------------
  db.exec(`
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

    INSERT INTO categories_new (id, name, created_at, updated_at)
    SELECT id, name,
           COALESCE(created_at, CURRENT_TIMESTAMP),
           COALESCE(updated_at, CURRENT_TIMESTAMP)
    FROM categories;

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
      must_change_password INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_new (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
    SELECT id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status FROM users;

    DROP TABLE IF EXISTS users;

    ALTER TABLE users_new RENAME TO users;
  `);

  // NOTE: intentionally NOT seeding a default admin user here. A placeholder
  // row with a fake bcrypt hash ('$2b$10$YourHashedPasswordHere') used to be
  // inserted at this point, which created a permanently-unusable admin
  // account (that string is not a valid hash of any real password). Admin
  // seeding is handled exclusively at runtime by api/users.js's GET /check
  // route, which generates a real random password and logs it once. If this
  // migration leaves the users table with zero rows on a fresh install,
  // that's expected and fine - /check will seed a proper admin on first
  // launch of the app.

  // ---------------------------------------------------------------------
  // 6. Verify referential integrity before committing
  // ---------------------------------------------------------------------
  const fkViolations = db.pragma("foreign_key_check");
  if (fkViolations.length > 0) {
    throw new Error(
      `Foreign key check failed with ${fkViolations.length} violation(s): ${JSON.stringify(
        fkViolations
      )}`
    );
  }

  db.exec("COMMIT");
  inTransaction = false;

  // Verify foreign keys are enabled
  db.pragma("foreign_keys = ON");

  console.log("✓ Database migration completed successfully!");
  console.log("✓ Fixed inventory.category -> inventory.category_id");
  console.log("✓ Added transactions.discount column");
  console.log("✓ Added transactions.tax column");
  console.log("✓ Added timestamp columns to all tables");
  console.log("✓ Foreign key constraints enabled");
  console.log("✓ PRAGMA foreign_key_check passed with no violations");

  // Category migration summary
  console.log("\nCategory migration summary:");
  console.log(
    `  - ${categorySummary.createdCount} new categor${
      categorySummary.createdCount === 1 ? "y" : "ies"
    } created from non-numeric inventory.category text`
  );
  console.log(
    `  - ${categorySummary.matchedExistingCount} inventory row category value(s) matched an existing category by name`
  );
  console.log(
    `  - ${categorySummary.nullCount} inventory row(s) had empty/blank category and were left with category_id = NULL`
  );
  if (categorySummary.created.length > 0) {
    console.log("  - Newly created categories:");
    categorySummary.created.forEach((c) => {
      console.log(`      * "${c.name}" -> categories.id = ${c.id}`);
    });
  }

  // Verify the migration
  console.log("\nVerifying migration...");

  const inventoryColumns = db.pragma("table_info(inventory)");
  console.log("\nInventory table columns:");
  inventoryColumns.forEach((col) => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  const transactionColumns = db.pragma("table_info(transactions)");
  console.log("\nTransactions table columns:");
  transactionColumns.forEach((col) => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  const categoryColumns = db.pragma("table_info(categories)");
  console.log("\nCategories table columns:");
  categoryColumns.forEach((col) => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  // Check foreign keys
  const foreignKeys = db.pragma("foreign_key_list(inventory)");
  if (foreignKeys.length > 0) {
    console.log("\nForeign keys on inventory table:");
    foreignKeys.forEach((fk) => {
      console.log(`  - ${fk.from} -> ${fk.table}(${fk.to})`);
    });
  } else {
    console.log("\nℹ Note: Foreign keys will be enforced on new inserts/updates");
  }

  console.log("\nPre-migration backup retained at:", backupPath);
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  if (inTransaction) {
    console.error("Rolling back...");
    try {
      db.exec("ROLLBACK");
    } catch (rollbackErr) {
      console.error("✗ Rollback also failed:", rollbackErr.message);
    }
  }
  console.error(
    "The pre-migration database backup is available at:",
    backupPath
  );
  process.exitCode = 1;
} finally {
  db.close();
  console.log("\nDatabase connection closed.");
}
