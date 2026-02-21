/**
 * Password Validation Middleware
 * Enforces strong password requirements
 */

/**
 * Password strength requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
function validatePassword(req, res, next) {
  const { password } = req.body;
  
  // Check if password exists
  if (!password) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password is required'
    });
  }
  
  if (typeof password !== 'string') {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must be a string'
    });
  }
  
  // Minimum length check
  if (password.length < 8) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must be at least 8 characters long'
    });
  }
  
  // Maximum length check
  if (password.length > 128) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must not exceed 128 characters'
    });
  }
  
  // Uppercase letter check
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must contain at least one uppercase letter'
    });
  }
  
  // Lowercase letter check
  if (!/[a-z]/.test(password)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must contain at least one lowercase letter'
    });
  }
  
  // Number check
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must contain at least one number'
    });
  }
  
  // Special character check
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must contain at least one special character (!@#$%^&*...)'
    });
  }
  
  // Check for common weak passwords
  const weakPasswords = [
    'password', 'admin', '12345678', 'qwerty123', 
    'letmein', 'welcome', 'monkey', 'dragon'
  ];
  
  if (weakPasswords.includes(password.toLowerCase())) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password is too common. Please choose a stronger password'
    });
  }
  
  next();
}

/**
 * Validates password reset token
 */
function validatePasswordResetToken(req, res, next) {
  const { token } = req.body;
  
  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Reset token is required'
    });
  }
  
  // Token should be a valid UUID or hash
  if (token.length < 32 || token.length > 128) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid reset token format'
    });
  }
  
  next();
}

/**
 * Checks password complexity and returns strength score
 * @param {string} password - Password to check
 * @returns {object} - { score: 0-5, feedback: string[] }
 */
function checkPasswordStrength(password) {
  let score = 0;
  const feedback = [];
  
  // Length checks
  if (password.length >= 8) score++;
  else feedback.push('Password should be at least 8 characters');
  
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  
  // Character variety checks
  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Add uppercase letters');
  
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  else feedback.push('Add numbers');
  
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;
  else feedback.push('Add special characters');
  
  return {
    score: Math.min(score, 5),
    feedback
  };
}

module.exports = {
  validatePassword,
  validatePasswordResetToken,
  checkPasswordStrength
};
