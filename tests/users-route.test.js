/**
 * Users Route Tests
 * Integration tests for api/users.js mounted as an Express app, covering:
 *  - POST /login (success/failure, no password leakage)
 *  - auth-gated routes reject requests without a valid X-Access-Token
 *  - GET /all succeeds once authenticated with perm_users
 */

const request = require("supertest");
const bcrypt = require("bcrypt");
const { db, initDB } = require("../api/db");

// api/users.js is itself a fully configured express() app (routes are
// attached to the same object it exports), so we can hand it straight to
// supertest - same pattern server.js uses via express.use("/api/users", ...).
const usersApp = require("../api/users");

const TEST_USERNAME = "TEST_users_route_user";
const TEST_PASSWORD = "correct-horse-battery-staple";
const TEST_USER_ID = 900000001;

describe("Users Route", () => {
  beforeAll(async () => {
    initDB();

    // Clean up any leftovers from a previous failed run, then seed a known
    // test user with perm_users=1 so GET /all can be exercised.
    db.prepare("DELETE FROM users WHERE username = ?").run(TEST_USERNAME);

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    db.prepare(
      `
      INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(TEST_USER_ID, TEST_USERNAME, "Test Users Route", hash, 1, 1, 1, 1, 1, "active");
  });

  afterAll(() => {
    db.prepare("DELETE FROM users WHERE username = ?").run(TEST_USERNAME);
  });

  test("POST /login with correct credentials returns auth:true, a token, and a password-free user", async () => {
    const res = await request(usersApp)
      .post("/login")
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.auth).toBe(true);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(10);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.username).toBe(TEST_USERNAME);
  });

  test("POST /login with wrong password returns auth:false", async () => {
    const res = await request(usersApp)
      .post("/login")
      .send({ username: TEST_USERNAME, password: "definitely-wrong-password" });

    expect(res.body.auth).toBe(false);
  });

  test("GET /all rejects with 401 when no X-Access-Token header is sent", async () => {
    const res = await request(usersApp).get("/all");

    expect(res.status).toBe(401);
  });

  test("GET /all succeeds with a valid token from a user with perm_users=1", async () => {
    const loginRes = await request(usersApp)
      .post("/login")
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    const token = loginRes.body.token;
    expect(typeof token).toBe("string");

    // Use a generous limit so our seeded user is guaranteed to be within
    // the returned page regardless of how many other users pre-exist.
    const allRes = await request(usersApp)
      .get("/all")
      .query({ limit: 10000 })
      .set("X-Access-Token", token);

    expect(allRes.status).toBe(200);
    expect(Array.isArray(allRes.body.data)).toBe(true);
    expect(typeof allRes.body.total).toBe("number");

    const found = allRes.body.data.find((u) => u.username === TEST_USERNAME);
    expect(found).toBeDefined();
    expect(found.password).toBeUndefined();
  });
});
