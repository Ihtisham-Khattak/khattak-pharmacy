/**
 * Error Handling Middleware
 * Centralized error handling for the application
 */

const path = require('path');
const fs = require('fs');

/**
 * Custom Application Error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found Handler
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
}

/**
 * Global Error Handler
 * Should be the last middleware in the chain
 */
function errorHandler(err, req, res, next) {
  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Log to file in production
  if (process.env.NODE_ENV === 'production') {
    logErrorToFile(err, req);
  }
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Prepare error response
  const errorResponse = {
    error: err.code || 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.message = 'An unexpected error occurred';
    delete errorResponse.stack;
  }
  
  res.status(statusCode).json(errorResponse);
}

/**
 * Logs errors to a file for production monitoring
 */
function logErrorToFile(err, req) {
  try {
    const logDir = path.join(__dirname, '../../logs');
    const logFile = path.join(logDir, 'error.log');
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: {
        message: err.message,
        code: err.code,
        stack: err.stack
      },
      request: {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
      }
    };
    
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (logError) {
    console.error('Failed to log error to file:', logError);
  }
}

/**
 * Async handler wrapper to catch promise rejections
 * @param {Function} fn - Async function to wrap
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error handler
 */
function validationErrorHandler(errors) {
  const error = new AppError(
    'Validation failed',
    400,
    'VALIDATION_ERROR'
  );
  error.details = errors;
  return error;
}

/**
 * Database error handler
 */
function databaseErrorHandler(err) {
  console.error('Database error:', err.message);
  
  // Don't expose database details to clients
  return new AppError(
    'Database operation failed',
    500,
    'DATABASE_ERROR'
  );
}

/**
 * Authentication error handler
 */
function authErrorHandler(message = 'Authentication failed') {
  return new AppError(message, 401, 'AUTHENTICATION_ERROR');
}

/**
 * Permission error handler
 */
function permissionErrorHandler(action = 'perform this action') {
  return new AppError(
    `You do not have permission to ${action}`,
    403,
    'PERMISSION_DENIED'
  );
}

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
  validationErrorHandler,
  databaseErrorHandler,
  authErrorHandler,
  permissionErrorHandler
};
