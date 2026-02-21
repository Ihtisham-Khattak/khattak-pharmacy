/**
 * Authentication Middleware
 * Protects API routes by requiring valid authentication
 */

const { db } = require('../db/db');

/**
 * Middleware to check if user is authenticated
 * Expects X-User-Id and X-Session-Token headers
 */
function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  const sessionToken = req.headers['x-session-token'];
  
  // Skip auth for public endpoints
  const publicEndpoints = [
    '/api/users/login',
    '/api/users/check'
  ];
  
  if (publicEndpoints.some(endpoint => req.path.startsWith(endpoint))) {
    return next();
  }
  
  // Check for required headers
  if (!userId || !sessionToken) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please provide valid authentication credentials'
    });
  }
  
  try {
    // Verify user exists and is active
    const user = db.prepare('SELECT id, username, status FROM users WHERE id = ?').get(parseInt(userId));
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid user',
        message: 'User not found'
      });
    }
    
    // Check if user is logged out
    if (user.status && user.status.startsWith('Logged Out')) {
      return res.status(401).json({ 
        error: 'Session expired',
        message: 'Please login again'
      });
    }
    
    // Attach user to request for downstream use
    req.user = {
      id: user.id,
      username: user.username
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'Failed to verify authentication'
    });
  }
}

/**
 * Middleware to check user permissions
 * @param {string} permission - Permission name (e.g., 'perm_products')
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please login first'
      });
    }
    
    try {
      const user = db.prepare(`SELECT ${permission} FROM users WHERE id = ?`).get(req.user.id);
      
      if (!user || user[permission] !== 1) {
        return res.status(403).json({ 
          error: 'Permission denied',
          message: 'You do not have permission to perform this action'
        });
      }
      
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ 
        error: 'Permission error',
        message: 'Failed to verify permissions'
      });
    }
  };
}

/**
 * Middleware to check if user is admin (id = 1)
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please login first'
    });
  }
  
  if (req.user.id !== 1) {
    return res.status(403).json({ 
      error: 'Admin required',
      message: 'This action requires administrator privileges'
    });
  }
  
  next();
}

module.exports = {
  requireAuth,
  requirePermission,
  requireAdmin
};
