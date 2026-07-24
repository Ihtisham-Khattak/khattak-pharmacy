/**
 * Wave 1 integrity tests: hold payment gate, session-bound user_id,
 * UUID ids, void restores stock on cancel/delete path.
 */

const request = require("supertest");
const moment = require("moment");
const { db, initDB } = require("../api/db");
const { createSession, destroySession } = require("../api/middleware/auth");

const transactionsApp = require("../api/transactions");
const categoriesApp = require("../api/categories");

const TEST_PRICE = 20.0;
const TEST_CATEGORY_ID = 900200001;
const TEST_PRODUCT_ID = 900200002;
const TEST_EXPIRED_ID = 900200004;
const TEST_USER_ID = 900200003;
const TEST_OTHER_USER_ID = 900200005;
const TEST_STARTING_QTY = 100;

let adminToken;
let cashierToken;

function itemsPayload(productId, qty) {
  return [
    {
      id: productId,
      product_name: "TEST Wave1 Product",
      quantity: qty,
      price: TEST_PRICE,
    },
  ];
}

function basePayload(overrides) {
  return {
    date: new Date().toISOString(),
    user_id: 999999999,
    till: 1,
    status: 1,
    customer_id: 0,
    ref_number: "",
    payment_type: "Cash",
    discount: 0,
    ...overrides,
  };
}

describe("Transactions - Wave 1", () => {
  beforeAll(() => {
    initDB();

    db.pragma("foreign_keys = OFF");
    db.prepare("DELETE FROM transactions WHERE id LIKE ?").run("TEST_W1_%");
    db.prepare("DELETE FROM inventory WHERE id IN (?, ?)").run(
      TEST_PRODUCT_ID,
      TEST_EXPIRED_ID,
    );
    db.prepare("DELETE FROM categories WHERE id = ?").run(TEST_CATEGORY_ID);
    db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(
      TEST_USER_ID,
      TEST_OTHER_USER_ID,
    );
    db.pragma("foreign_keys = ON");

    db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(
      TEST_CATEGORY_ID,
      "TEST Wave1 Category",
    );

    db.prepare(
      `
      INSERT INTO inventory (id, name, category_id, price, quantity, minStock, stock, expirationDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_PRODUCT_ID,
      "TEST Wave1 Product",
      TEST_CATEGORY_ID,
      TEST_PRICE,
      TEST_STARTING_QTY,
      0,
      1,
      moment().add(30, "days").format("DD-MMM-YYYY"),
    );

    db.prepare(
      `
      INSERT INTO inventory (id, name, category_id, price, quantity, minStock, stock, expirationDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_EXPIRED_ID,
      "TEST Expired Product",
      TEST_CATEGORY_ID,
      TEST_PRICE,
      50,
      0,
      1,
      moment().subtract(5, "days").format("DD-MMM-YYYY"),
    );

    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_USER_ID,
      "TEST_w1_admin",
      "Test W1 Admin",
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
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      TEST_OTHER_USER_ID,
      "TEST_w1_cashier",
      "Test W1 Cashier",
      "not-a-real-hash",
      0,
      0,
      0,
      0,
      0,
      "active",
    );

    adminToken = createSession({
      id: TEST_USER_ID,
      username: "TEST_w1_admin",
      fullname: "Test W1 Admin",
      status: "active",
      perm_products: 1,
      perm_categories: 1,
      perm_transactions: 1,
      perm_users: 1,
      perm_settings: 1,
      must_change_password: 0,
    }).token;

    cashierToken = createSession({
      id: TEST_OTHER_USER_ID,
      username: "TEST_w1_cashier",
      fullname: "Test W1 Cashier",
      status: "active",
      perm_products: 0,
      perm_categories: 0,
      perm_transactions: 0,
      perm_users: 0,
      perm_settings: 0,
      must_change_password: 0,
    }).token;
  });

  afterAll(() => {
    destroySession(adminToken);
    destroySession(cashierToken);
    db.pragma("foreign_keys = OFF");
    db.prepare("DELETE FROM transactions WHERE id LIKE ?").run("%900200%");
    db.prepare(
      "DELETE FROM transactions WHERE user_id IN (?, ?)",
    ).run(TEST_USER_ID, TEST_OTHER_USER_ID);
    db.prepare("DELETE FROM inventory WHERE id IN (?, ?)").run(
      TEST_PRODUCT_ID,
      TEST_EXPIRED_ID,
    );
    db.prepare("DELETE FROM categories WHERE id = ?").run(TEST_CATEGORY_ID);
    db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(
      TEST_USER_ID,
      TEST_OTHER_USER_ID,
    );
    db.pragma("foreign_keys = ON");
  });

  test("POST /new allows hold (status 0) with paid 0", async () => {
    const beforeQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    const qty = 2;

    const res = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", cashierToken)
      .send(
        basePayload({
          status: 0,
          ref_number: "HOLD-W1-1",
          hold_customer_name: "Test Customer",
          hold_customer_phone: "03001234567",
          items: itemsPayload(TEST_PRODUCT_ID, qty),
          total: TEST_PRICE * qty,
          paid: 0,
        }),
      );

    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const afterQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterQty).toBe(beforeQty - qty);

    const row = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(res.body.id);
    expect(row.status).toBe(0);
    expect(row.paid).toBe(0);
    expect(row.user_id).toBe(TEST_OTHER_USER_ID);
  });

  test("POST /new binds user_id to session, ignoring body spoof", async () => {
    const res = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", cashierToken)
      .send(
        basePayload({
          user_id: TEST_USER_ID,
          items: itemsPayload(TEST_PRODUCT_ID, 1),
          total: TEST_PRICE,
          paid: 1000,
        }),
      );

    expect(res.status).toBe(200);
    const row = db
      .prepare("SELECT user_id FROM transactions WHERE id = ?")
      .get(res.body.id);
    expect(row.user_id).toBe(TEST_OTHER_USER_ID);
  });

  test("POST /void restores stock for a hold cancelled by cashier", async () => {
    const qty = 3;
    const create = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", cashierToken)
      .send(
        basePayload({
          status: 0,
          ref_number: "HOLD-W1-VOID",
          hold_customer_name: "Void Customer",
          hold_customer_phone: "03007654321",
          items: itemsPayload(TEST_PRODUCT_ID, qty),
          total: TEST_PRICE * qty,
          paid: 0,
        }),
      );
    expect(create.status).toBe(200);
    const txnId = create.body.id;

    const midQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;

    const voidRes = await request(transactionsApp)
      .post(`/void/${txnId}`)
      .set("X-Access-Token", cashierToken);
    expect(voidRes.status).toBe(200);

    const afterQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterQty).toBe(midQty + qty);

    const row = db
      .prepare("SELECT status FROM transactions WHERE id = ?")
      .get(txnId);
    expect(row.status).toBe(-1);
  });

  test("POST /delete voids (restores stock) instead of hard-deleting", async () => {
    const qty = 1;
    const create = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", adminToken)
      .send(
        basePayload({
          items: itemsPayload(TEST_PRODUCT_ID, qty),
          total: TEST_PRICE,
          paid: 1000,
        }),
      );
    expect(create.status).toBe(200);
    const txnId = create.body.id;
    const midQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;

    const del = await request(transactionsApp)
      .post("/delete")
      .set("X-Access-Token", adminToken)
      .send({ orderId: txnId });
    expect(del.status).toBe(200);

    const afterQty = db
      .prepare("SELECT quantity FROM inventory WHERE id = ?")
      .get(TEST_PRODUCT_ID).quantity;
    expect(afterQty).toBe(midQty + qty);

    const row = db
      .prepare("SELECT status FROM transactions WHERE id = ?")
      .get(txnId);
    expect(row).toBeDefined();
    expect(row.status).toBe(-1);
  });

  test("POST /new rejects expired products", async () => {
    const res = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", adminToken)
      .send(
        basePayload({
          items: [
            {
              id: TEST_EXPIRED_ID,
              product_name: "TEST Expired Product",
              quantity: 1,
              price: TEST_PRICE,
            },
          ],
          total: TEST_PRICE,
          paid: 1000,
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Expired Product");
  });

  test("cashier can complete hold via PUT without perm_transactions", async () => {
    const qty = 1;
    const create = await request(transactionsApp)
      .post("/new")
      .set("X-Access-Token", cashierToken)
      .send(
        basePayload({
          status: 0,
          ref_number: "HOLD-W1-PAY",
          hold_customer_name: "Pay Customer",
          hold_customer_phone: "03001112222",
          items: itemsPayload(TEST_PRODUCT_ID, qty),
          total: TEST_PRICE * qty,
          paid: 0,
        }),
      );
    expect(create.status).toBe(200);
    const txnId = create.body.id;
    const items = itemsPayload(TEST_PRODUCT_ID, qty);

    const pay = await request(transactionsApp)
      .put("/new")
      .set("X-Access-Token", cashierToken)
      .send(
        basePayload({
          _id: txnId,
          id: txnId,
          status: 1,
          ref_number: "HOLD-W1-PAY",
          hold_customer_name: "Pay Customer",
          hold_customer_phone: "03001112222",
          items,
          total: TEST_PRICE * qty,
          paid: 1000,
        }),
      );

    expect(pay.status).toBe(200);
    const row = db
      .prepare("SELECT status, paid FROM transactions WHERE id = ?")
      .get(txnId);
    expect(row.status).toBe(1);
    expect(row.paid).toBeGreaterThan(0);
  });

  test("GET /categories/all requires auth", async () => {
    const unauth = await request(categoriesApp).get("/all");
    expect(unauth.status).toBe(401);

    const auth = await request(categoriesApp)
      .get("/all")
      .set("X-Access-Token", adminToken);
    expect(auth.status).toBe(200);
  });
});
