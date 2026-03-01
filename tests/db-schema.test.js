/**
 * Database Schema Tests
 * Tests to verify the database schema and foreign key constraints
 */

const { db, initDB, dbPath } = require('../api/db');
const path = require('path');

describe('Database Schema', () => {
  beforeAll(() => {
    initDB();
  });

  describe('Table Structure', () => {
    test('inventory table has category_id column', () => {
      const columns = db.pragma("table_info(inventory)");
      const categoryIdColumn = columns.find(col => col.name === 'category_id');
      
      expect(categoryIdColumn).toBeDefined();
      expect(categoryIdColumn.type).toBe('INTEGER');
    });

    test('inventory table has created_at and updated_at columns', () => {
      const columns = db.pragma("table_info(inventory)");
      const createdAt = columns.find(col => col.name === 'created_at');
      const updatedAt = columns.find(col => col.name === 'updated_at');
      
      expect(createdAt).toBeDefined();
      expect(updatedAt).toBeDefined();
    });

    test('transactions table has discount and tax columns', () => {
      const columns = db.pragma("table_info(transactions)");
      const discount = columns.find(col => col.name === 'discount');
      const tax = columns.find(col => col.name === 'tax');
      
      expect(discount).toBeDefined();
      expect(tax).toBeDefined();
      expect(discount.type).toBe('REAL');
      expect(tax.type).toBe('REAL');
    });

    test('transactions table has created_at and updated_at columns', () => {
      const columns = db.pragma("table_info(transactions)");
      const createdAt = columns.find(col => col.name === 'created_at');
      const updatedAt = columns.find(col => col.name === 'updated_at');
      
      expect(createdAt).toBeDefined();
      expect(updatedAt).toBeDefined();
    });

    test('categories table has created_at and updated_at columns', () => {
      const columns = db.pragma("table_info(categories)");
      const createdAt = columns.find(col => col.name === 'created_at');
      const updatedAt = columns.find(col => col.name === 'updated_at');
      
      expect(createdAt).toBeDefined();
      expect(updatedAt).toBeDefined();
    });
  });

  describe('Foreign Key Constraints', () => {
    test('inventory table has foreign key to categories', () => {
      const foreignKeys = db.pragma("foreign_key_list(inventory)");
      const categoryFK = foreignKeys.find(fk => fk.from === 'category_id');
      
      expect(categoryFK).toBeDefined();
      expect(categoryFK.table).toBe('categories');
      expect(categoryFK.to).toBe('id');
    });

    test('transactions table has foreign key to users', () => {
      const foreignKeys = db.pragma("foreign_key_list(transactions)");
      const userFK = foreignKeys.find(fk => fk.from === 'user_id');
      
      expect(userFK).toBeDefined();
      expect(userFK.table).toBe('users');
      expect(userFK.to).toBe('id');
    });

    test('transactions table has foreign key to customers', () => {
      const foreignKeys = db.pragma("foreign_key_list(transactions)");
      const customerFK = foreignKeys.find(fk => fk.from === 'customer_id');
      
      expect(customerFK).toBeDefined();
      expect(customerFK.table).toBe('customers');
      expect(customerFK.to).toBe('id');
    });
  });

  describe('Indexes', () => {
    test('inventory table has index on name', () => {
      const indexes = db.pragma("index_list(inventory)");
      const nameIndex = indexes.find(idx => idx.name === 'idx_inventory_name');
      
      expect(nameIndex).toBeDefined();
    });

    test('inventory table has index on category_id', () => {
      const indexes = db.pragma("index_list(inventory)");
      const categoryIndex = indexes.find(idx => idx.name === 'idx_inventory_category');
      
      expect(categoryIndex).toBeDefined();
    });

    test('transactions table has index on date', () => {
      const indexes = db.pragma("index_list(transactions)");
      const dateIndex = indexes.find(idx => idx.name === 'idx_transactions_date');
      
      expect(dateIndex).toBeDefined();
    });
  });

  describe('CRUD Operations', () => {
    let testCategoryId;
    let testProductId;
    let testTransactionId;
    let testUserId;

    beforeAll(() => {
      // Clean up any existing test data
      db.prepare("DELETE FROM transactions WHERE id LIKE ?").run('TEST_%');
      db.prepare("DELETE FROM inventory WHERE id LIKE ?").run('TEST_%');
      db.prepare("DELETE FROM categories WHERE id LIKE ?").run('TEST_%');
      
      // Create test user if not exists
      const bcrypt = require('bcrypt');
      const hash = bcrypt.hashSync('password', 10);
      testUserId = Date.now();
      db.prepare(`
        INSERT OR IGNORE INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(testUserId, 'testuser', 'Test User', hash, 1, 1, 1, 1, 1, 'active');
    });

    afterAll(() => {
      // Clean up test data
      db.prepare("DELETE FROM transactions WHERE id LIKE ?").run('TEST_%');
      db.prepare("DELETE FROM inventory WHERE id LIKE ?").run('TEST_%');
      db.prepare("DELETE FROM categories WHERE id LIKE ?").run('TEST_%');
      db.prepare("DELETE FROM users WHERE username = ?").run('testuser');
    });

    test('should create a category', () => {
      const id = Date.now();
      testCategoryId = id;
      
      const result = db.prepare(
        "INSERT INTO categories (id, name) VALUES (?, ?)"
      ).run(id, 'Test Category');
      
      expect(result.changes).toBe(1);
      
      const category = db.prepare(
        "SELECT * FROM categories WHERE id = ?"
      ).get(id);
      
      expect(category).toBeDefined();
      expect(category.name).toBe('Test Category');
    });

    test('should create a product with category_id', () => {
      const id = Date.now();
      testProductId = id;
      
      const result = db.prepare(`
        INSERT INTO inventory (id, name, category_id, price, quantity, stock)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, 'Test Product', testCategoryId, 10.00, 100, 1);
      
      expect(result.changes).toBe(1);
      
      const product = db.prepare(
        "SELECT * FROM inventory WHERE id = ?"
      ).get(id);
      
      expect(product).toBeDefined();
      expect(product.name).toBe('Test Product');
      expect(product.category_id).toBe(testCategoryId);
    });

    test('should fail to create product with invalid category_id (FK constraint)', () => {
      const id = Date.now();
      
      expect(() => {
        db.prepare(`
          INSERT INTO inventory (id, name, category_id, price, quantity, stock)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, 'Invalid Product', 999999, 10.00, 100, 1);
      }).toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should create a transaction', () => {
      const id = 'TEST_' + Date.now();
      testTransactionId = id;
      
      const items = JSON.stringify([
        { id: testProductId, product_name: 'Test Product', quantity: 1, price: 10.00 }
      ]);
      
      const result = db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, items, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, testUserId, 1, 0, 10.00, 0, 0, items, 0, 0);
      
      expect(result.changes).toBe(1);
      
      const transaction = db.prepare(
        "SELECT * FROM transactions WHERE id = ?"
      ).get(id);
      
      expect(transaction).toBeDefined();
      expect(transaction.discount).toBe(0);
      expect(transaction.tax).toBe(0);
    });

    test('should update a product', () => {
      const newPrice = 15.00;
      
      const result = db.prepare(`
        UPDATE inventory SET price = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newPrice, testProductId);
      
      expect(result.changes).toBe(1);
      
      const product = db.prepare(
        "SELECT * FROM inventory WHERE id = ?"
      ).get(testProductId);
      
      expect(product.price).toBe(newPrice);
    });

    test('should delete a category', () => {
      // First delete the product that references the category
      db.prepare("DELETE FROM inventory WHERE id = ?").run(testProductId);
      
      const result = db.prepare(
        "DELETE FROM categories WHERE id = ?"
      ).run(testCategoryId);
      
      expect(result.changes).toBe(1);
      
      const category = db.prepare(
        "SELECT * FROM categories WHERE id = ?"
      ).get(testCategoryId);
      
      expect(category).toBeUndefined();
    });

    test('should handle product with NULL category_id', () => {
      const id = Date.now();
      
      // category_id can be NULL when product has no category
      // But we need to omit it from the INSERT or use DEFAULT
      const result = db.prepare(`
        INSERT INTO inventory (id, name, price, quantity, stock)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, 'Product Without Category', 10.00, 100, 1);
      
      expect(result.changes).toBe(1);
      
      const product = db.prepare(
        "SELECT * FROM inventory WHERE id = ?"
      ).get(id);
      
      expect(product).toBeDefined();
      expect(product.category_id).toBeNull();
      
      // Clean up
      db.prepare("DELETE FROM inventory WHERE id = ?").run(id);
    });
  });

  describe('Hold Order Operations', () => {
    let testCategoryId;
    let testProductId;
    let testUserId;

    beforeAll(() => {
      // Create test user if not exists
      const bcrypt = require('bcrypt');
      const hash = bcrypt.hashSync('password', 10);
      testUserId = Date.now();
      db.prepare(`
        INSERT OR IGNORE INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(testUserId, 'testuser_hold', 'Test User Hold', hash, 1, 1, 1, 1, 1, 'active');

      // Create test category and product
      const catId = Date.now();
      db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(catId, 'Hold Test Category');
      testCategoryId = catId;

      const prodId = Date.now() + 1; // Ensure unique ID
      db.prepare(`
        INSERT INTO inventory (id, name, category_id, price, quantity, stock)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(prodId, 'Hold Test Product', catId, 10.00, 100, 1);
      testProductId = prodId;
    });

    afterAll(() => {
      // Clean up test data
      db.prepare("DELETE FROM transactions WHERE ref_number LIKE ?").run('TEST_HOLD_%');
      db.prepare("DELETE FROM inventory WHERE id = ?").run(testProductId);
      db.prepare("DELETE FROM categories WHERE id = ?").run(testCategoryId);
      db.prepare("DELETE FROM users WHERE username = ?").run('testuser_hold');
    });

    test('should create a hold order (status=0) with ref_number', () => {
      const id = 'TEST_HOLD_' + Date.now();
      const items = JSON.stringify([
        { id: testProductId, product_name: 'Hold Test Product', quantity: 2, price: 10.00 }
      ]);
      
      const result = db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, ref_number, items, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, testUserId, 1, 0, 20.00, 0, 0, 'TEST_HOLD_REF_001', items, 0, 0);
      
      expect(result.changes).toBe(1);
      
      const transaction = db.prepare(
        "SELECT * FROM transactions WHERE id = ?"
      ).get(id);
      
      expect(transaction).toBeDefined();
      expect(transaction.status).toBe(0);
      expect(transaction.ref_number).toBe('TEST_HOLD_REF_001');
      expect(transaction.discount).toBe(0);
      expect(transaction.tax).toBe(0);
    });

    test('should retrieve hold orders', () => {
      const transactions = db.prepare(
        "SELECT * FROM transactions WHERE ref_number != '' AND status = 0"
      ).all();
      
      expect(Array.isArray(transactions)).toBe(true);
      
      // Parse items JSON
      const formatted = transactions.map(t => ({
        ...t,
        items: JSON.parse(t.items)
      }));
      
      expect(formatted.length).toBeGreaterThan(0);
    });

    test('should update hold order to paid (status=1)', () => {
      const id = 'TEST_HOLD_' + Date.now();
      const items = JSON.stringify([
        { id: testProductId, product_name: 'Hold Test Product', quantity: 1, price: 10.00 }
      ]);
      
      // Create hold order
      db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, ref_number, items, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, testUserId, 1, 0, 10.00, 0, 0, 'TEST_HOLD_REF_002', items, 0, 0);
      
      // Update to paid
      const result = db.prepare(`
        UPDATE transactions SET status = ?, paid = ?, change = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(1, 10.00, 0, id);
      
      expect(result.changes).toBe(1);
      
      const transaction = db.prepare(
        "SELECT * FROM transactions WHERE id = ?"
      ).get(id);
      
      expect(transaction.status).toBe(1);
      expect(transaction.paid).toBe(10.00);
    });
  });
});
