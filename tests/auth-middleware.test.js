/**
 * Auth Middleware Tests
 * Tests for api/middleware/auth.js: session creation/lookup/destruction,
 * requireAuth, and requirePermission.
 */

const {
  createSession,
  destroySession,
  getSession,
  requireAuth,
  requirePermission,
} = require("../api/middleware/auth");

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("Auth Middleware", () => {
  const fakeUser = {
    id: 999001,
    username: "TEST_authuser",
    fullname: "Test Auth User",
    password: "should-never-leak-out",
    status: "active",
    perm_products: 1,
    perm_categories: 0,
    perm_transactions: 1,
    perm_users: 0,
    perm_settings: 0,
    must_change_password: 0,
  };

  let createdTokens = [];

  afterEach(() => {
    // Clean up any sessions created during a test so subsequent tests /
    // files don't see stale state in the in-memory session store.
    createdTokens.forEach((t) => destroySession(t));
    createdTokens = [];
  });

  describe("createSession", () => {
    test("returns a token and a user object with no password field", () => {
      const { token, user } = createSession(fakeUser);
      createdTokens.push(token);

      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(10);
      expect(user).toBeDefined();
      expect(user.password).toBeUndefined();
      expect(user.id).toBe(fakeUser.id);
      expect(user.username).toBe(fakeUser.username);
    });

    test("generates a unique token per call", () => {
      const a = createSession(fakeUser);
      const b = createSession(fakeUser);
      createdTokens.push(a.token, b.token);

      expect(a.token).not.toBe(b.token);
    });
  });

  describe("getSession", () => {
    test("returns the right session for a valid token", () => {
      const { token, user } = createSession(fakeUser);
      createdTokens.push(token);

      const session = getSession(token);
      expect(session).toBeDefined();
      expect(session.id).toBe(user.id);
      expect(session.username).toBe(fakeUser.username);
      expect(session.password).toBeUndefined();
    });

    test("returns undefined for an unknown token", () => {
      expect(getSession("this-token-does-not-exist")).toBeUndefined();
    });
  });

  describe("destroySession", () => {
    test("removes the session so getSession no longer finds it", () => {
      const { token } = createSession(fakeUser);
      expect(getSession(token)).toBeDefined();

      destroySession(token);
      expect(getSession(token)).toBeUndefined();
    });

    test("does not throw when called with a missing/falsy token", () => {
      expect(() => destroySession(undefined)).not.toThrow();
      expect(() => destroySession(null)).not.toThrow();
      expect(() => destroySession("")).not.toThrow();
    });
  });

  describe("requireAuth", () => {
    test("valid X-Access-Token header passes through and sets req.user", () => {
      const { token, user } = createSession(fakeUser);
      createdTokens.push(token);

      const req = { headers: { "x-access-token": token } };
      const res = mockRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(user.id);
      expect(res.status).not.toHaveBeenCalled();
    });

    test("missing token responds 401 and does not call next()", () => {
      const req = { headers: {} };
      const res = mockRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    test("invalid/unknown token responds 401 and does not call next()", () => {
      const req = { headers: { "x-access-token": "bogus-token-value" } };
      const res = mockRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("requirePermission", () => {
    test("calls next() when req.user[permKey] === 1", () => {
      const req = { user: { perm_products: 1 } };
      const res = mockRes();
      const next = jest.fn();

      requirePermission("perm_products")(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test("responds 403 when req.user[permKey] !== 1", () => {
      const req = { user: { perm_products: 0 } };
      const res = mockRes();
      const next = jest.fn();

      requirePermission("perm_products")(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    test("responds 403 when req.user is missing entirely", () => {
      const req = {};
      const res = mockRes();
      const next = jest.fn();

      requirePermission("perm_products")(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
