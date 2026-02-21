/**
 * Initialize Admin User Script
 * Run this to create/reset the admin user
 */

const { db, initDB } = require('../src/server/db/db');
const bcrypt = require('bcrypt');

async function createAdminUser() {
  try {
    console.log('Initializing database...');
    initDB();
    
    // Check if admin exists
    const admin = db.prepare('SELECT * FROM users WHERE id = 1').get();
    
    if (admin) {
      console.log('Admin user already exists!');
      console.log('Username:', admin.username);
      console.log('Status:', admin.status);
      
      // Reset password to temporary one
      const tempPassword = 'Admin@123';
      const hash = await bcrypt.hash(tempPassword, 12);
      
      db.prepare('UPDATE users SET password = ?, must_change_password = 1, failed_login_attempts = 0, locked_until = NULL WHERE id = 1')
        .run(hash);
      
      console.log('\n⚠️  Admin password has been reset!');
      console.log('Temporary password:', tempPassword);
      console.log('You will be forced to change it on login.');
    } else {
      // Create admin user
      const tempPassword = 'Admin@123';
      const hash = await bcrypt.hash(tempPassword, 12);
      
      db.prepare(`
        INSERT INTO users (id, username, fullname, password, perm_products, perm_categories, perm_transactions, perm_users, perm_settings, status, must_change_password)
        VALUES (1, 'admin', 'Administrator', ?, 1, 1, 1, 1, 1, '', 1)
      `).run(hash);
      
      console.log('\n✅ Admin user created!');
      console.log('Username: admin');
      console.log('Temporary password:', tempPassword);
      console.log('You will be forced to change it on login.');
    }
    
    console.log('\nDatabase initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createAdminUser();
