/**
 * Auth hardening: inactive users + must_change_password gate.
 */
const request = require("supertest");
const bcrypt = require("bcrypt");
const { db, initDB } = require("../api/db");
const { createSession, destroySession } = require("../api/middleware/auth");

const usersApp = require("../api/users");
const inventoryApp = require("../api/inventory");

const ACTIVE_ID = 900300001;
const INACTIVE_ID = 900300002;
const MUST_CHANGE_ID = 900300003;
const PASSWORD = "correct-horse-battery";

describe("Users auth hardening", () => {
  let activeToken;
  let mustChangeToken;

  beforeAll(async () => {
    initDB();
    const hash = await bcrypt.hash(PASSWORD, 10);

    db.pragma("foreign_keys = OFF");
    for (const id of [ACTIVE_ID, INACTIVE_ID, MUST_CHANGE_ID]) {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }
    db.pragma("foreign_keys = ON");

    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password, is_active)
      VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, 'active', 0, 1)
    `,
    ).run(ACTIVE_ID, "TEST_active_user", "Active", hash);

    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password, is_active)
      VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, 'active', 0, 0)
    `,
    ).run(INACTIVE_ID, "TEST_inactive_user", "Inactive", hash);

    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password, is_active)
      VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, 'active', 1, 1)
    `,
    ).run(MUST_CHANGE_ID, "TEST_must_change_user", "MustChange", hash);

    const active = createSession(
      db.prepare("SELECT * FROM users WHERE id = ?").get(ACTIVE_ID),
    );
    activeToken = active.token;

    const must = createSession(
      db.prepare("SELECT * FROM users WHERE id = ?").get(MUST_CHANGE_ID),
    );
    mustChangeToken = must.token;
  });

  afterAll(() => {
    if (activeToken) destroySession(activeToken);
    if (mustChangeToken) destroySession(mustChangeToken);
    db.pragma("foreign_keys = OFF");
    for (const id of [ACTIVE_ID, INACTIVE_ID, MUST_CHANGE_ID]) {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }
    db.pragma("foreign_keys = ON");
  });

  test("login rejects inactive accounts", async () => {
    const res = await request(usersApp).post("/login").send({
      username: "TEST_inactive_user",
      password: PASSWORD,
    });
    expect(res.body.auth).toBe(false);
    expect(res.body.error).toBe("AccountInactive");
  });

  test("must_change_password blocks inventory routes but allows change-password", async () => {
    const blocked = await request(inventoryApp)
      .get("/")
      .set("X-Access-Token", mustChangeToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("PasswordChangeRequired");

    const changed = await request(usersApp)
      .post("/change-password")
      .set("X-Access-Token", mustChangeToken)
      .send({ new_password: "new-secret-password" });
    expect(changed.status).toBe(200);

    const after = db
      .prepare("SELECT must_change_password FROM users WHERE id = ?")
      .get(MUST_CHANGE_ID);
    expect(after.must_change_password).toBe(0);

    const allowed = await request(inventoryApp)
      .get("/")
      .set("X-Access-Token", mustChangeToken);
    expect(allowed.status).toBe(200);
  });

  test("active user can still call authenticated routes", async () => {
    const res = await request(usersApp)
      .get("/all")
      .set("X-Access-Token", activeToken);
    expect(res.status).toBe(200);
  });
});
