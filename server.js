/**
 * Express Server Configuration
 * Secure API server with authentication and rate limiting
 */

const http = require("http");
const express = require("express")();
const server = http.createServer(express);
const bodyParser = require("body-parser");
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

// Import middleware
const { requireAuth } = require("./src/server/middleware/auth");
const { apiLimiter } = require("./src/server/middleware/rateLimiter");
const { notFoundHandler, errorHandler } = require("./src/server/middleware/errorHandler");

// Import database
const { initDB, dbPath } = require("./src/server/db/db");

// Initialize SQLite Database
initDB();

// Set up app data paths
process.env.APPDATA = app.getPath("appData");
process.env.APPNAME = app.getName() || "PharmaSpot";
const PORT = process.env.PORT || 0;

console.log("Server started");

// Configure Express
express.use(bodyParser.json({ limit: '10mb' }));
express.use(bodyParser.urlencoded({ extended: false, limit: '10mb' }));

// Apply rate limiting to all API routes
express.use('/api', apiLimiter);

// CORS configuration (restricted for security)
express.all("/api/*", function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "file://*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-type,Accept,X-Access-Token,X-Key,X-User-Id,X-Session-Token",
  );
  if (req.method == "OPTIONS") {
    res.status(200).end();
  } else {
    next();
  }
});

// Security headers
express.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Health check endpoint
express.get("/", function (req, res) {
  res.json({ 
    status: "online",
    service: "PharmaSpot API",
    timestamp: new Date().toISOString()
  });
});

// Apply authentication middleware to all API routes
express.use('/api', requireAuth);

// API Routes
express.use("/api/inventory", require("./api/inventory"));
express.use("/api/customers", require("./api/customers"));
express.use("/api/categories", require("./api/categories"));
express.use("/api/settings", require("./api/settings"));
express.use("/api/users", require("./api/users"));
express.use("/api", require("./api/transactions"));

// 404 handler for API routes
express.use('/api', notFoundHandler);

// Global error handler (must be last)
express.use(errorHandler);

server.listen(PORT, () => {
  process.env.PORT = server.address().port;
  console.log("Listening on PORT", process.env.PORT);
});

/**
 * Restarts the server process.
 */
function restartServer() {
  server.close(() => {
    // Remove cached modules so require() reloads them
    Object.keys(require.cache).forEach((key) => {
      if (key.includes("api") || key.endsWith("server.js") || key.includes("src/server")) {
        delete require.cache[key];
      }
    });
    // Re-require server.js to restart everything
    require("./server");
  });
}

module.exports = { restartServer, server };
