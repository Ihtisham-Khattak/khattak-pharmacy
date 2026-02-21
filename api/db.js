/**
 * Database Module - Backward Compatibility Wrapper
 * All database operations now use the secure implementation in src/server/db/db.js
 */

const { db, initDB, dbPath, logAudit, createSession, validateSession, cleanupExpiredSessions } = require('../src/server/db/db');

// Re-export for backward compatibility
module.exports = {
  db,
  initDB,
  dbPath,
  logAudit,
  createSession,
  validateSession,
  cleanupExpiredSessions
};
