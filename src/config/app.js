/**
 * Application Configuration
 * Centralized configuration management with environment variable support
 */

const path = require('path');
const fs = require('fs');

// Load environment variables from .env file if it exists
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.trim().split('=');
    if (key && !key.startsWith('#')) {
      const value = valueParts.join('=').trim();
      if (value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

/**
 * Application configuration
 */
const appConfig = {
  // Application Info
  NAME: process.env.APP_NAME || 'PharmaSpot',
  VERSION: process.env.APP_VERSION || '1.5.1',
  ENV: process.env.NODE_ENV || 'development',
  
  // Server Configuration
  SERVER: {
    PORT: parseInt(process.env.PORT) || 0, // 0 means auto-assign
    HOST: process.env.HOST || 'localhost',
    TIMEOUT: parseInt(process.env.SERVER_TIMEOUT) || 30000
  },
  
  // Security Configuration
  SECURITY: {
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    SESSION_EXPIRY_HOURS: parseInt(process.env.SESSION_EXPIRY) || 8,
    MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION) || 15,
    PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
    REQUIRE_SPECIAL_CHARS: process.env.REQUIRE_SPECIAL_CHARS !== 'false'
  },
  
  // Rate Limiting
  RATE_LIMIT: {
    LOGIN_WINDOW_MS: parseInt(process.env.LOGIN_RATE_WINDOW) || 15 * 60 * 1000,
    LOGIN_MAX_ATTEMPTS: parseInt(process.env.LOGIN_RATE_MAX) || 5,
    API_WINDOW_MS: parseInt(process.env.API_RATE_WINDOW) || 15 * 60 * 1000,
    API_MAX_REQUESTS: parseInt(process.env.API_RATE_MAX) || 100
  },
  
  // Database Configuration
  DATABASE: {
    PATH: process.env.DB_PATH || null, // null means use default app data path
    ENABLE_WAL: process.env.DB_ENABLE_WAL !== 'false',
    ENABLE_FOREIGN_KEYS: process.env.DB_ENABLE_FOREIGN_KEYS !== 'false'
  },
  
  // File Upload Configuration
  UPLOAD: {
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024, // 2MB
    ALLOWED_TYPES: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp').split(','),
    UPLOAD_PATH: process.env.UPLOAD_PATH || 'uploads'
  },
  
  // Logging Configuration
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    FILE_PATH: process.env.LOG_PATH || null,
    MAX_FILE_SIZE: parseInt(process.env.LOG_MAX_SIZE) || 10 * 1024 * 1024, // 10MB
    MAX_FILES: parseInt(process.env.LOG_MAX_FILES) || 5
  },
  
  // Update Server (for auto-updates)
  UPDATE_SERVER: process.env.UPDATE_SERVER || 'https://download.pharmaspot.patternsdigital.com',
  
  // Copyright Year
  COPYRIGHT_YEAR: process.env.COPYRIGHT_YEAR || '2022'
};

/**
 * Validate configuration
 */
function validateConfig() {
  const errors = [];
  
  if (appConfig.SECURITY.BCRYPT_ROUNDS < 10) {
    errors.push('BCRYPT_ROUNDS should be at least 10 for security');
  }
  
  if (appConfig.SECURITY.PASSWORD_MIN_LENGTH < 8) {
    errors.push('PASSWORD_MIN_LENGTH should be at least 8');
  }
  
  if (errors.length > 0) {
    console.warn('Configuration warnings:', errors);
  }
  
  return errors.length === 0;
}

/**
 * Get configuration value by path
 * @param {string} key - Dot notation key (e.g., 'SERVER.PORT')
 * @param {*} defaultValue - Default value if key doesn't exist
 */
function getConfig(key, defaultValue = undefined) {
  const parts = key.split('.');
  let value = appConfig;
  
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return defaultValue;
    }
  }
  
  return value;
}

/**
 * Export configuration
 */
module.exports = {
  appConfig,
  getConfig,
  validateConfig
};
