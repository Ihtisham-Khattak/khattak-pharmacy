/**
 * Validation Middleware
 * Validates and sanitizes input data
 */

const validator = require('validator');

/**
 * Validates user input for registration/update
 */
function validateUserInput(req, res, next) {
  const { username, fullname, password } = req.body;
  
  // Username validation
  if (!username || typeof username !== 'string') {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Username is required and must be a string'
    });
  }
  
  const sanitizedUsername = validator.escape(username.trim());
  if (sanitizedUsername.length < 3 || sanitizedUsername.length > 50) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Username must be between 3 and 50 characters'
    });
  }
  
  // Fullname validation (optional)
  if (fullname !== undefined) {
    if (typeof fullname !== 'string') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Full name must be a string'
      });
    }
    const sanitizedFullname = validator.escape(fullname.trim());
    if (sanitizedFullname.length > 100) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Full name must not exceed 100 characters'
      });
    }
  }
  
  // Password validation is handled by validatePassword middleware
  
  // Sanitize and attach to request
  req.sanitizedUser = {
    username: sanitizedUsername,
    fullname: fullname ? validator.escape(fullname.trim()) : undefined
  };
  
  next();
}

/**
 * Validates product input
 */
function validateProductInput(req, res, next) {
  const { name, price, quantity } = req.body;
  
  // Name validation
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Product name is required'
    });
  }
  
  const sanitizedName = validator.escape(name.trim());
  if (sanitizedName.length < 1 || sanitizedName.length > 200) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Product name must be between 1 and 200 characters'
    });
  }
  
  // Price validation
  if (price !== undefined) {
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Price must be a non-negative number'
      });
    }
  }
  
  // Quantity validation
  if (quantity !== undefined) {
    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Quantity must be a non-negative integer'
      });
    }
  }
  
  // Attach sanitized data
  req.sanitizedProduct = {
    name: sanitizedName,
    price: price !== undefined ? parseFloat(price) : undefined,
    quantity: quantity !== undefined ? parseInt(quantity) : undefined,
    generic: req.body.generic ? validator.escape(req.body.generic) : undefined,
    category: req.body.category ? validator.escape(req.body.category) : undefined,
    strength: req.body.strength ? validator.escape(req.body.strength) : undefined,
    form: req.body.form ? validator.escape(req.body.form) : undefined,
    minStock: req.body.minStock ? parseInt(req.body.minStock) : 0,
    expirationDate: req.body.expirationDate ? validator.escape(req.body.expirationDate) : undefined
  };
  
  next();
}

/**
 * Validates customer input
 */
function validateCustomerInput(req, res, next) {
  const { name, phone, email, address } = req.body;
  
  // Name validation
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Customer name is required'
    });
  }
  
  const sanitizedName = validator.escape(name.trim());
  if (sanitizedName.length < 1 || sanitizedName.length > 200) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Customer name must be between 1 and 200 characters'
    });
  }
  
  // Phone validation (optional)
  if (phone !== undefined && phone !== '') {
    if (!validator.isMobilePhone(phone, 'any')) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid phone number format'
      });
    }
  }
  
  // Email validation (optional)
  if (email !== undefined && email !== '') {
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid email format'
      });
    }
  }
  
  // Attach sanitized data
  req.sanitizedCustomer = {
    name: sanitizedName,
    phone: phone ? validator.escape(phone) : undefined,
    email: email ? validator.escape(email.toLowerCase().trim()) : undefined,
    address: address ? validator.escape(address) : undefined
  };
  
  next();
}

/**
 * Validates category input
 */
function validateCategoryInput(req, res, next) {
  const { name } = req.body;
  
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Category name is required'
    });
  }
  
  const sanitizedName = validator.escape(name.trim());
  if (sanitizedName.length < 1 || sanitizedName.length > 100) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Category name must be between 1 and 100 characters'
    });
  }
  
  req.sanitizedCategory = {
    name: sanitizedName
  };
  
  next();
}

/**
 * Validates transaction input
 */
function validateTransactionInput(req, res, next) {
  const { items, total, paid, payment_type } = req.body;
  
  // Items validation
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Transaction must contain at least one item'
    });
  }
  
  // Validate each item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.id || !item.quantity || item.quantity <= 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: `Invalid item at position ${i + 1}`
      });
    }
  }
  
  // Total validation
  if (total === undefined || total < 0) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Total must be a non-negative number'
    });
  }
  
  // Paid validation
  if (paid === undefined || paid < 0) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Paid amount must be a non-negative number'
    });
  }
  
  // Payment type validation
  if (payment_type !== undefined) {
    const validTypes = ['Cash', 'Card', 'Check', 'Mobile Money', 'Credit'];
    if (!validTypes.includes(payment_type)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid payment type'
      });
    }
  }
  
  next();
}

module.exports = {
  validateUserInput,
  validateProductInput,
  validateCustomerInput,
  validateCategoryInput,
  validateTransactionInput
};
