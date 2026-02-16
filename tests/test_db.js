const { db, initDB } = require("../api/db");
const bcrypt = require("bcrypt");

async function testDB() {
  try {
    initDB();

    // Test Users Table
    const hash = await bcrypt.hash("admin", 10);
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertUser.run(1, "admin", "Administrator", hash, 1, 1, 1, 1, 1);

    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get("admin");
    console.log("Test User retrieved:", user.username);

    // Test Product Table
    const insertProduct = db.prepare(`
      INSERT OR REPLACE INTO inventory (id, name, price, quantity)
      VALUES (?, ?, ?, ?)
    `);
    insertProduct.run(Date.now(), "Test Medicine", 10.5, 100);

    const product = db
      .prepare("SELECT * FROM inventory ORDER BY id DESC LIMIT 1")
      .get();
    console.log(
      "Test Product retrieved:",
      product.name,
      "Price:",
      product.price,
    );

    console.log("Database test completed successfully!");
  } catch (err) {
    console.error("Database test failed:", err);
  }
}

testDB();
