/**
 * Out-of-stock sync + reorder API tests.
 */
const request = require("supertest");
const crypto = require("crypto");
const { db, initDB } = require("../api/db");
const { createSession, destroySession } = require("../api/middleware/auth");

const transactionsApp = require("../api/transactions");
const outOfStockApp = require("../api/outOfStock");

const TEST_PRICE = 10.0;
const TEST_CATEGORY_ID = 900200001;
const TEST_PRODUCT_ID = 900200002;
const TEST_USER_ID = 900200003;
const TEST_STARTING_QTY = 5;
const TEST_MIN_STOCK = 3;

let token;

function newTxnId() {
  return crypto.randomUUID();
}

describe("Out of stock", () => {
  beforeAll(() => {
    initDB();

    db.pragma("foreign_keys = OFF");
    db.prepare("DELETE FROM out_of_stock_products WHERE product_id = ?").run(
      TEST_PRODUCT_ID,
    );
    db.prepare("DELETE FROM transactions WHERE user_id = ?").run(TEST_USER_ID);
    db.prepare("DELETE FROM inventory WHERE id = ?").run(TEST_PRODUCT_ID);
    db.prepare("DELETE FROM categories WHERE id = ?").run(TEST_CATEGORY_ID);
    db.prepare("DELETE FROM users WHERE id = ?").run(TEST_USER_ID);
    db.pragma("foreign_keys = ON");

    db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(
      TEST_CATEGORY_ID,
      "TEST OOS Category",
    );

    db.prepare(
      `
      INSERT INTO inventory (id, name, category_id, price, quantity, minStock, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_PRODUCT_ID,
      "TEST OOS Product",
      TEST_CATEGORY_ID,
      TEST_PRICE,
      TEST_STARTING_QTY,
      TEST_MIN_STOCK,
      1,
    );

    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_USER_ID,
      "TEST_oos_user",
      "Test OOS User",
      "not-a-real-hash",
      1,
      1,
      1,
      1,
      1,
      "active",
    );

    const session = createSession({
      id: TEST_USER_ID,
      username: "TEST_oos_user",
      fullname: "Test OOS User",
      perm_products: 1,
      perm_categories: 1,
      perm_transactions: 1,
      perm_users: 1,
      perm_settings: 1,
      status: "active",
    });
    token = session.token;
  });

  afterAll(() => {
    if (token) destroySession(token);
    db.pragma("foreign_keys = OFF");
    db.prepare("DELETE FROM out_of_stock_products WHERE product_id = ?").run(
      TEST_PRODUCT_ID,
    );
    db.prepare("DELETE FROM transactions WHERE user_id = ?").run(TEST_USER_ID);
    db.prepare("DELETE FROM inventory WHERE id = ?").run(TEST_PRODUCT_ID);
    db.prepare("DELETE FROM categories WHERE id = ?").run(TEST_CATEGORY_ID);
    db.prepare("DELETE FROM users WHERE id = ?").run(TEST_USER_ID);
    db.pragma("foreign_keys = ON");
  });

  test("void sale removes product from OOS list after stock restore", async () => {
    const qty = 3;
    const txnId = newTxnId();
    const subtotal = TEST_PRICE * qty;

    const saleRes = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", token)
      .send({
        _id: txnId,
        id: txnId,
        date: new Date().toISOString(),
        user_id: TEST_USER_ID,
        till: 1,
        status: 1,
        customer_id: 0,
        ref_number: "",
        payment_type: "Cash",
        discount: 0,
        items: [
          {
            id: TEST_PRODUCT_ID,
            product_name: "TEST OOS Product",
            quantity: qty,
            price: TEST_PRICE,
          },
        ],
        total: subtotal,
        paid: 100000,
      });
    expect(saleRes.status).toBe(200);

    const afterSaleQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterSaleQty).toBe(TEST_STARTING_QTY - qty);
    expect(afterSaleQty).toBeLessThanOrEqual(TEST_MIN_STOCK);

    const oosAfterSale = db
      .prepare("SELECT * FROM out_of_stock_products WHERE product_id = ?")
      .get(TEST_PRODUCT_ID);
    expect(oosAfterSale).toBeDefined();

    const voidRes = await request(transactionsApp)
      .post(`/void/${txnId}`)
      .set("X-Access-Token", token);
    expect(voidRes.status).toBe(200);

    const afterVoidQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterVoidQty).toBe(TEST_STARTING_QTY);

    const oosAfterVoid = db
      .prepare("SELECT * FROM out_of_stock_products WHERE product_id = ?")
      .get(TEST_PRODUCT_ID);
    expect(oosAfterVoid).toBeUndefined();
  });

  test("PUT /:id accepts reorder quantity 0 and 404s missing rows", async () => {
    db.prepare(
      `
      INSERT INTO out_of_stock_products
        (product_id, product_name, strength, type, minimum_quantity, current_quantity, reorder_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(TEST_PRODUCT_ID, "TEST OOS Product", null, null, TEST_MIN_STOCK, 2, null);

    const row = db
      .prepare("SELECT id FROM out_of_stock_products WHERE product_id = ?")
      .get(TEST_PRODUCT_ID);
    expect(row).toBeDefined();

    const zeroRes = await request(outOfStockApp)
      .put(`/${row.id}`)
      .set("X-Access-Token", token)
      .send({ reorder_quantity: 0 });
    expect(zeroRes.status).toBe(200);

    const saved = db
      .prepare("SELECT reorder_quantity FROM out_of_stock_products WHERE id = ?")
      .get(row.id);
    expect(saved.reorder_quantity).toBe(0);

    const missingRes = await request(outOfStockApp)
      .put("/999999999")
      .set("X-Access-Token", token)
      .send({ reorder_quantity: 5 });
    expect(missingRes.status).toBe(404);
  });
});
