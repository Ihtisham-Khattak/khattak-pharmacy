/**
 * Schema dual-write integration tests
 * Verifies normalized transaction_items + stock_movements writes and ledger payments.
 */

const request = require("supertest");
const crypto = require("crypto");
const { db, initDB, TARGET_SCHEMA_VERSION } = require("../api/db");
const { createSession, destroySession } = require("../api/middleware/auth");

const transactionsApp = require("../api/transactions");
const ledgerApp = require("../api/ledger");

const TEST_PRICE = 12.5;
const TEST_CATEGORY_ID = 900230001;
const TEST_PRODUCT_ID = 900230002;
const TEST_USER_ID = 900230003;
const TEST_CUSTOMER_ID = 900230004;
const TEST_STARTING_QTY = 200;

let token;

function newTxnId() {
  return crypto.randomUUID();
}

function basePayload(overrides) {
  return {
    date: new Date().toISOString(),
    user_id: TEST_USER_ID,
    till: 1,
    status: 1,
    customer_id: 0,
    ref_number: "",
    payment_type: "Cash",
    discount: 0,
    ...overrides,
  };
}

function cleanupTestData() {
  db.prepare(
    "DELETE FROM stock_movements WHERE ref_id IN (SELECT id FROM transactions WHERE user_id = ?)",
  ).run(TEST_USER_ID);
  db.prepare(
    "DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)",
  ).run(TEST_USER_ID);
  db.prepare("DELETE FROM ledger_entries WHERE customer_id = ?").run(
    TEST_CUSTOMER_ID,
  );
  db.prepare("DELETE FROM customer_accounts WHERE customer_id = ?").run(
    TEST_CUSTOMER_ID,
  );
  db.prepare("DELETE FROM transactions WHERE user_id = ?").run(TEST_USER_ID);
  db.prepare("DELETE FROM inventory WHERE id = ?").run(TEST_PRODUCT_ID);
  db.prepare("DELETE FROM categories WHERE id = ?").run(TEST_CATEGORY_ID);
  db.prepare("DELETE FROM customers WHERE id = ?").run(TEST_CUSTOMER_ID);
  db.prepare("DELETE FROM users WHERE id = ?").run(TEST_USER_ID);
}

describe("Schema dual-write", () => {
  beforeAll(() => {
    initDB();
    cleanupTestData();

    db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(
      TEST_CATEGORY_ID,
      "TEST Dual-Write Category",
    );

    db.prepare(
      `
      INSERT INTO inventory (id, name, category_id, price, quantity, minStock, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_PRODUCT_ID,
      "TEST Dual-Write Product",
      TEST_CATEGORY_ID,
      TEST_PRICE,
      TEST_STARTING_QTY,
      0,
      1,
    );

    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_USER_ID,
      "TEST_dual_write_user",
      "Test Dual Write User",
      "not-a-real-hash",
      1,
      1,
      1,
      1,
      1,
      "active",
    );

    db.prepare(
      `
      INSERT INTO customers (id, name, phone, email, address)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_CUSTOMER_ID,
      "TEST Dual-Write Customer",
      "5551234567",
      "dualwrite@test.local",
      "123 Test St",
    );

    const session = createSession({
      id: TEST_USER_ID,
      username: "TEST_dual_write_user",
      fullname: "Test Dual Write User",
      status: "active",
      perm_products: 1,
      perm_categories: 1,
      perm_transactions: 1,
      perm_users: 1,
      perm_settings: 1,
      must_change_password: 0,
    });
    token = session.token;
  });

  afterAll(() => {
    destroySession(token);
    cleanupTestData();
  });

  test("initDB sets schema user_version to TARGET_SCHEMA_VERSION", () => {
    const version = db.pragma("user_version", { simple: true });
    expect(version).toBeGreaterThanOrEqual(TARGET_SCHEMA_VERSION);
  });

  test("POST /new writes transaction_items and stock_movements for a sale", async () => {
    const qty = 2;
    const txnId = newTxnId();

    const res = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", token)
      .send(
        basePayload({
          _id: txnId,
          id: txnId,
          items: [
            {
              id: TEST_PRODUCT_ID,
              product_name: "TEST Dual-Write Product",
              quantity: qty,
              price: TEST_PRICE,
            },
          ],
          total: TEST_PRICE * qty,
          paid: 1000,
        }),
      );

    expect(res.status).toBe(200);

    const lineItems = db
      .prepare(
        "SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY id",
      )
      .all(txnId);
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].product_id).toBe(TEST_PRODUCT_ID);
    expect(lineItems[0].product_name).toBe("TEST Dual-Write Product");
    expect(lineItems[0].quantity).toBeCloseTo(qty, 2);
    expect(lineItems[0].unit_price).toBeCloseTo(TEST_PRICE, 2);
    expect(lineItems[0].line_total).toBeCloseTo(TEST_PRICE * qty, 2);

    const movements = db
      .prepare(
        "SELECT * FROM stock_movements WHERE ref_type = ? AND ref_id = ? AND reason = ?",
      )
      .all("transaction", txnId, "sale");
    expect(movements).toHaveLength(1);
    expect(movements[0].product_id).toBe(TEST_PRODUCT_ID);
    expect(movements[0].qty_delta).toBe(-qty);
  });

  test("POST /void/:transactionId records stock_movements with reason void", async () => {
    const qty = 3;
    const txnId = newTxnId();

    const saleRes = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", token)
      .send(
        basePayload({
          _id: txnId,
          id: txnId,
          items: [
            {
              id: TEST_PRODUCT_ID,
              product_name: "TEST Dual-Write Product",
              quantity: qty,
              price: TEST_PRICE,
            },
          ],
          total: TEST_PRICE * qty,
          paid: 1000,
        }),
      );
    expect(saleRes.status).toBe(200);

    const voidRes = await request(transactionsApp)
      .post(`/void/${txnId}`)
      .set("X-Access-Token", token);
    expect(voidRes.status).toBe(200);

    const voidMovements = db
      .prepare(
        "SELECT * FROM stock_movements WHERE ref_type = ? AND ref_id = ? AND reason = ?",
      )
      .all("transaction", txnId, "void");
    expect(voidMovements).toHaveLength(1);
    expect(voidMovements[0].product_id).toBe(TEST_PRODUCT_ID);
    expect(voidMovements[0].qty_delta).toBe(qty);
  });

  test("POST /payment reduces customer account balance", async () => {
    const adjustRes = await request(ledgerApp)
      .post("/adjust")
      .set("X-Access-Token", token)
      .send({
        customer_id: TEST_CUSTOMER_ID,
        amount: 50,
        note: "seed balance",
      });
    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.balance).toBeCloseTo(50, 2);

    const paymentRes = await request(ledgerApp)
      .post("/payment")
      .set("X-Access-Token", token)
      .send({
        customer_id: TEST_CUSTOMER_ID,
        amount: 20,
        note: "partial payment",
      });
    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.balance).toBeCloseTo(30, 2);

    const accountRes = await request(ledgerApp)
      .get(`/account/${TEST_CUSTOMER_ID}`)
      .set("X-Access-Token", token);
    expect(accountRes.status).toBe(200);
    expect(accountRes.body.balance).toBeCloseTo(30, 2);

    const paymentEntry = db
      .prepare(
        "SELECT * FROM ledger_entries WHERE customer_id = ? AND entry_type = 'payment' ORDER BY id DESC LIMIT 1",
      )
      .get(TEST_CUSTOMER_ID);
    expect(paymentEntry).toBeDefined();
    expect(paymentEntry.amount).toBeCloseTo(-20, 2);
  });
});
