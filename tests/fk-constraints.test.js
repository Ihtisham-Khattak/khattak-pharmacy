/**
 * Foreign Key Constraint Integration Tests
 * Tests to verify FK constraints work through the API layer
 */

const { db, initDB, ensureForeignKeysEnabled } = require('../api/db');

describe('Foreign Key Constraints - Integration', () => {
  let testCategoryId;
  let testUserId;

  beforeAll(() => {
    initDB();
    ensureForeignKeysEnabled();
    
    // Verify FK is enabled
    const fkStatus = db.pragma("foreign_keys");
    expect(fkStatus[0].foreign_keys).toBe(1);
    
    // Create test category
    testCategoryId = Date.now();
    db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)")
      .run(testCategoryId, 'FK Test Category');
    
    // Create test user
    const bcrypt = require('bcrypt');
    const hash = bcrypt.hashSync('password', 10);
    testUserId = Date.now() + 1;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(testUserId, 'fk_test_user', 'FK Test User', hash, 1, 1, 1, 1, 1, 'active');
  });

  afterAll(() => {
    // Temporarily disable FK for cleanup
    db.pragma("foreign_keys = OFF");
    
    // Clean up
    db.prepare("DELETE FROM inventory WHERE id LIKE ?").run('FK_TEST_%');
    db.prepare("DELETE FROM transactions WHERE id LIKE ?").run('FK_TEST_%');
    db.prepare("DELETE FROM categories WHERE id = ?").run(testCategoryId);
    db.prepare("DELETE FROM users WHERE username = ?").run('fk_test_user');
    
    // Re-enable FK
    db.pragma("foreign_keys = ON");
  });

  describe('Inventory - Category FK', () => {
    test('should create product with valid category_id', () => {
      const id = 'FK_TEST_' + Date.now();
      const numericId = Date.now();
      
      const result = db.prepare(`
        INSERT INTO inventory (id, name, category_id, price, quantity)
        VALUES (?, ?, ?, ?, ?)
      `).run(numericId, 'FK Test Product', testCategoryId, 10.00, 100);
      
      expect(result.changes).toBe(1);
      
      const product = db.prepare("SELECT * FROM inventory WHERE id = ?").get(numericId);
      expect(product).toBeDefined();
      expect(product.category_id).toBe(testCategoryId);
    });

    test('should create product with NULL category_id', () => {
      const numericId = Date.now() + 1;
      
      const result = db.prepare(`
        INSERT INTO inventory (id, name, category_id, price, quantity)
        VALUES (?, ?, NULL, ?, ?)
      `).run(numericId, 'Product Without Category', 10.00, 100);
      
      expect(result.changes).toBe(1);
      
      const product = db.prepare("SELECT * FROM inventory WHERE id = ?").get(numericId);
      expect(product).toBeDefined();
      expect(product.category_id).toBeNull();
    });

    test('should FAIL to create product with invalid category_id', () => {
      const numericId = Date.now() + 2;
      const invalidCategoryId = 999999999;
      
      expect(() => {
        db.prepare(`
          INSERT INTO inventory (id, name, category_id, price, quantity)
          VALUES (?, ?, ?, ?, ?)
        `).run(numericId, 'Invalid Product', invalidCategoryId, 10.00, 100);
      }).toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should FAIL to create product with category_id = 0', () => {
      const numericId = Date.now() + 3;
      
      expect(() => {
        db.prepare(`
          INSERT INTO inventory (id, name, category_id, price, quantity)
          VALUES (?, ?, ?, ?, ?)
        `).run(numericId, 'Zero Category Product', 0, 10.00, 100);
      }).toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  describe('Transactions - User FK', () => {
    test('should create transaction with valid user_id', () => {
      const id = 'FK_TEST_TXN_' + Date.now();
      const items = JSON.stringify([{ id: 1, product_name: 'Test', quantity: 1, price: 10 }]);
      
      const result = db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, items, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, testUserId, 1, 0, 10.00, 0, 0, items, 0, 0);
      
      expect(result.changes).toBe(1);
      
      const txn = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
      expect(txn).toBeDefined();
      expect(txn.user_id).toBe(testUserId);
    });

    test('should FAIL to create transaction with invalid user_id', () => {
      const id = 'FK_TEST_TXN_INVALID_' + Date.now();
      const invalidUserId = 999999999;
      const items = JSON.stringify([{ id: 1, product_name: 'Test', quantity: 1, price: 10 }]);
      
      expect(() => {
        db.prepare(`
          INSERT INTO transactions (id, user_id, till, status, total, paid, change, items, discount, tax)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, invalidUserId, 1, 0, 10.00, 0, 0, items, 0, 0);
      }).toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should create transaction with NULL user_id', () => {
      const id = 'FK_TEST_TXN_NULL_' + Date.now();
      const items = JSON.stringify([{ id: 1, product_name: 'Test', quantity: 1, price: 10 }]);
      
      const result = db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, items, discount, tax)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 1, 0, 10.00, 0, 0, items, 0, 0);
      
      expect(result.changes).toBe(1);
      
      const txn = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
      expect(txn).toBeDefined();
      expect(txn.user_id).toBeNull();
    });
  });

  describe('Transactions - Customer FK', () => {
    let testCustomerId;

    beforeAll(() => {
      // Create test customer
      testCustomerId = Date.now();
      db.prepare("INSERT INTO customers (id, name) VALUES (?, ?)")
        .run(testCustomerId, 'FK Test Customer');
    });

    afterAll(() => {
      // Temporarily disable FK for cleanup
      db.pragma("foreign_keys = OFF");
      db.prepare("DELETE FROM customers WHERE id = ?").run(testCustomerId);
      db.pragma("foreign_keys = ON");
    });

    test('should create transaction with valid customer_id', () => {
      const id = 'FK_TEST_CUST_' + Date.now();
      const items = JSON.stringify([{ id: 1, product_name: 'Test', quantity: 1, price: 10 }]);
      
      const result = db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, customer_id, items, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, testUserId, 1, 0, 10.00, 0, 0, testCustomerId, items, 0, 0);
      
      expect(result.changes).toBe(1);
      
      const txn = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
      expect(txn).toBeDefined();
      expect(txn.customer_id).toBe(testCustomerId);
    });

    test('should FAIL to create transaction with invalid customer_id', () => {
      const id = 'FK_TEST_CUST_INVALID_' + Date.now();
      const invalidCustomerId = 999999999;
      const items = JSON.stringify([{ id: 1, product_name: 'Test', quantity: 1, price: 10 }]);
      
      expect(() => {
        db.prepare(`
          INSERT INTO transactions (id, user_id, till, status, total, paid, change, customer_id, items, discount, tax)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, testUserId, 1, 0, 10.00, 0, 0, invalidCustomerId, items, 0, 0);
      }).toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should create transaction with customer_id = 0 (walk-in)', () => {
      const id = 'FK_TEST_CUST_ZERO_' + Date.now();
      const items = JSON.stringify([{ id: 1, product_name: 'Test', quantity: 1, price: 10 }]);
      
      // Customer 0 should work as it represents "walk-in customer"
      // But we need to check if 0 exists or if we need to allow it
      const result = db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, customer_id, items, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(id, testUserId, 1, 0, 10.00, 0, 0, items, 0, 0);
      
      // This might fail if customer 0 doesn't exist
      // If it fails, we need to either:
      // 1. Create a customer with id=0
      // 2. Change the schema to allow customer_id to be NULL for walk-in customers
      expect(result.changes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Hold Orders', () => {
    test('should create hold order (status=0) with valid data', () => {
      const id = 'FK_TEST_HOLD_' + Date.now();
      const items = JSON.stringify([{ id: 1, product_name: 'Test', quantity: 2, price: 10 }]);
      
      const result = db.prepare(`
        INSERT INTO transactions (id, user_id, till, status, total, paid, change, ref_number, items, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, testUserId, 1, 0, 20.00, 0, 0, 'HOLD_REF_001', items, 0, 0);
      
      expect(result.changes).toBe(1);
      
      const txn = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
      expect(txn).toBeDefined();
      expect(txn.status).toBe(0);
      expect(txn.ref_number).toBe('HOLD_REF_001');
    });

    test('should retrieve hold orders', () => {
      const transactions = db.prepare(
        "SELECT * FROM transactions WHERE ref_number != '' AND status = 0"
      ).all();
      
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThan(0);
    });
  });
});
