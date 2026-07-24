/**
 * Transactions Financial Integrity Tests
 * Integration tests for api/transactions.js, covering:
 *  - POST /new always stores the SERVER-recomputed total (never a
 *    client-understated total)
 *  - POST /new rejects oversell attempts atomically (no partial decrement)
 *  - POST /void/:transactionId restores inventory after voiding a sale
 *
 * server.js mounts this router with: express.use("/api", require("./api/transactions"))
 * so within the router itself the routes are relative ("/new", "/void/:id", etc).
 */

const request = require("supertest");
const crypto = require("crypto");
const { db, initDB } = require("../api/db");
const { createSession, destroySession } = require("../api/middleware/auth");

const transactionsApp = require("../api/transactions");

const TEST_PRICE = 25.0;
const TEST_CATEGORY_ID = 900100001;
const TEST_PRODUCT_ID = 900100002;
const TEST_USER_ID = 900100003;
const TEST_STARTING_QTY = 500;

let token;

/**
 * Mirrors computeAuthoritativeTotals() in api/transactions.js so the test
 * doesn't hardcode an assumption about the store's current tax settings.
 */
function computeExpectedTotal(subtotal, discount) {
  const effectiveDiscount = discount || 0;
  const afterDiscount = subtotal - effectiveDiscount;
  const settings = db
    .prepare("SELECT tax, percentage, charge_tax FROM settings WHERE id = 1")
    .get();
  let taxAmount = 0;
  if (settings && settings.charge_tax) {
    const percentage = parseFloat(settings.percentage) || 0;
    taxAmount = (afterDiscount * percentage) / 100;
  }
  return afterDiscount + taxAmount;
}

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

describe("Transactions - financial integrity", () => {
  beforeAll(() => {
    initDB();

    // Clean up any leftovers from a previous failed run.
    db.pragma("foreign_keys = OFF");
    db.prepare("DELETE FROM transactions WHERE user_id = ?").run(TEST_USER_ID);
    db.prepare("DELETE FROM inventory WHERE id = ?").run(TEST_PRODUCT_ID);
    db.prepare("DELETE FROM categories WHERE id = ?").run(TEST_CATEGORY_ID);
    db.prepare("DELETE FROM users WHERE id = ?").run(TEST_USER_ID);
    db.pragma("foreign_keys = ON");

    db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(
      TEST_CATEGORY_ID,
      "TEST Financials Category",
    );

    db.prepare(
      `
      INSERT INTO inventory (id, name, category_id, price, quantity, minStock, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(TEST_PRODUCT_ID, "TEST Financials Product", TEST_CATEGORY_ID, TEST_PRICE, TEST_STARTING_QTY, 0, 1);

    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(TEST_USER_ID, "TEST_txn_financials_user", "Test Txn User", "not-a-real-hash", 1, 1, 1, 1, 1, "active");

    // Mint a session token directly (same auth.js module instance the
    // transactions router uses) instead of going through a real login.
    const session = createSession({
      id: TEST_USER_ID,
      username: "TEST_txn_financials_user",
      fullname: "Test Txn User",
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
    db.pragma("foreign_keys = OFF");
    db.prepare("DELETE FROM transactions WHERE user_id = ?").run(TEST_USER_ID);
    db.prepare("DELETE FROM inventory WHERE id = ?").run(TEST_PRODUCT_ID);
    db.prepare("DELETE FROM categories WHERE id = ?").run(TEST_CATEGORY_ID);
    db.prepare("DELETE FROM users WHERE id = ?").run(TEST_USER_ID);
    db.pragma("foreign_keys = ON");
  });

  test("POST /new stores the server-recomputed total, not a client-understated total", async () => {
    const qty = 3;
    const subtotal = TEST_PRICE * qty;
    const expectedTotal = computeExpectedTotal(subtotal, 0);
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
              product_name: "TEST Financials Product",
              quantity: qty,
              price: TEST_PRICE,
            },
          ],
          // Client-understated total - the real subtotal is TEST_PRICE * qty.
          total: 0.01,
          paid: 100000,
        }),
      );

    expect(res.status).toBe(200);

    const stored = db.prepare("SELECT * FROM transactions WHERE id = ?").get(txnId);
    expect(stored).toBeDefined();
    expect(stored.total).toBeCloseTo(expectedTotal, 2);
    expect(stored.total).not.toBeCloseTo(0.01, 2);
  });

  test("POST /new rejects an oversell attempt and leaves inventory quantity unchanged (atomic)", async () => {
    const beforeQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;

    const oversellQty = beforeQty + 1000000;
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
              product_name: "TEST Financials Product",
              quantity: oversellQty,
              price: TEST_PRICE,
            },
          ],
          total: TEST_PRICE * oversellQty,
          paid: TEST_PRICE * oversellQty * 2,
        }),
      );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const afterQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterQty).toBe(beforeQty);

    // Proves atomicity: the transaction row must not have been committed
    // either - no orphaned sale with a failed stock adjustment.
    const txnRow = db.prepare("SELECT * FROM transactions WHERE id = ?").get(txnId);
    expect(txnRow).toBeUndefined();
  });

  test("POST /void/:transactionId restores inventory quantity after voiding a completed sale", async () => {
    const qty = 4;
    const beforeSaleQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    const subtotal = TEST_PRICE * qty;
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
              product_name: "TEST Financials Product",
              quantity: qty,
              price: TEST_PRICE,
            },
          ],
          total: subtotal,
          paid: 100000,
        }),
      );
    expect(saleRes.status).toBe(200);

    const afterSaleQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterSaleQty).toBe(beforeSaleQty - qty);

    const voidRes = await request(transactionsApp)
      .post(`/void/${txnId}`)
      .set("X-Access-Token", token);
    expect(voidRes.status).toBe(200);

    const afterVoidQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterVoidQty).toBe(beforeSaleQty);

    const txnRow = db.prepare("SELECT * FROM transactions WHERE id = ?").get(txnId);
    expect(txnRow.status).toBe(-1);
  });
});
