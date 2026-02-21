# PharmaSpot Upgrade Guide - Version 1.6.0 (Security Update)

## ⚠️ Important Security Update

This version includes critical security improvements. **Please read this entire guide before upgrading.**

---

## 🚨 Breaking Changes

### 1. Default Admin Password Changed

**What Changed:**
- The default admin password is no longer hardcoded as "admin"
- A random strong password is generated on first run
- Password **must** be changed on first login

**Action Required:**
1. **Before upgrading**: Note down any custom admin credentials you have
2. **After upgrading**: Check the console for the temporary admin password (development mode only)
3. **Production deployments**: See "Production Deployment" section below

**For Production Upgrades:**
```bash
# Option 1: Reset admin password before upgrade
# Run this on the old version first
sqlite3 path/to/pharmacy.db "UPDATE users SET must_change_password=0 WHERE id=1;"

# Option 2: After upgrade, use the password reset script
node scripts/reset-admin-password.js
```

### 2. Password Requirements Strengthened

**New Requirements:**
- Minimum 8 characters (was: any length)
- Must contain uppercase letter (was: not required)
- Must contain lowercase letter (was: not required)
- Must contain number (was: not required)
- Must contain special character (was: not required)

**Action Required:**
- All users will need to change their passwords on next login
- Communicate new password requirements to all staff

### 3. API Authentication Required

**What Changed:**
- All API endpoints now require authentication
- Direct API access without credentials is blocked

**Action Required:**
- No action needed for normal users
- Custom integrations must be updated to include authentication headers

### 4. Electron Security Settings

**What Changed:**
- `nodeIntegration` disabled in renderer
- `contextIsolation` enabled
- New preload script for IPC communication

**Action Required:**
- Custom renderer scripts may need updates
- Direct Node.js API access from renderer is no longer possible

---

## 📋 Upgrade Checklist

### Pre-Upgrade

- [ ] **Backup your database** (critical!)
  - Use the built-in backup feature: Menu → File → Backup
  - Or manually copy: `data/pharmacy.db`
  
- [ ] **Document current users**
  - List all users and their permission levels
  - Note any custom configurations
  
- [ ] **Test on a non-production system first**
  - Clone your production data to a test system
  - Verify all features work correctly

### Upgrade Process

1. **Close PharmaSpot completely**
   - Ensure it's not running in system tray
   
2. **Backup installation**
   ```bash
   cp -r PharmaSpot PharmaSpot-backup-$(date +%Y%m%d)
   ```

3. **Install new version**
   - Download latest release
   - Extract to installation directory
   - Or pull from git: `git pull origin main`

4. **Update dependencies**
   ```bash
   npm install
   ```

5. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

6. **Run database migrations**
   - Database will auto-migrate on first launch
   - Check console for migration messages

### Post-Upgrade

- [ ] **Verify database integrity**
  ```bash
  sqlite3 path/to/pharmacy.db "PRAGMA integrity_check;"
  ```

- [ ] **Check admin account**
  - Login with temporary password (shown in console)
  - Change password immediately

- [ ] **Verify user permissions**
  - Check each user can access appropriate features
  - Adjust permissions if needed

- [ ] **Test critical features**
  - [ ] Point of Sale
  - [ ] Transactions
  - [ ] Inventory management
  - [ ] User management
  - [ ] Settings
  - [ ] Backup/Restore

- [ ] **Review audit logs**
  - Menu → View → Transactions
  - Check for any unusual activity

---

## 🔧 Configuration Changes

### New Environment Variables

Create a `.env` file in the application root:

```env
# Required for production
NODE_ENV=production

# Security settings
BCRYPT_ROUNDS=12
PASSWORD_MIN_LENGTH=8

# Session settings
SESSION_EXPIRY_HOURS=8

# Rate limiting
LOGIN_RATE_MAX=5
API_RATE_MAX=100
```

See `.env.example` for all available options.

### Deprecated Settings

The following settings in `app.config.js` are deprecated but still supported:
- `UPDATE_SERVER` → Use `UPDATE_SERVER` in .env
- `COPYRIGHT_YEAR` → Use `COPYRIGHT_YEAR` in .env

---

## 🗄️ Database Schema Changes

### New Tables
- `sessions` - Session management
- `password_resets` - Password reset tokens
- `audit_log` - Security audit trail

### Modified Tables
- `users` - Added columns:
  - `email`
  - `phone`
  - `must_change_password`
  - `last_login`
  - `failed_login_attempts`
  - `locked_until`

- `inventory` - Added columns:
  - `barcode`
  - `manufacturer`
  - `batch_number`
  - `cost_price`

- `transactions` - Added columns:
  - `discount`
  - `tax`
  - `notes`

### Automatic Migration

The database migrates automatically on first launch. However, you can manually verify:

```sql
-- Check new tables exist
SELECT name FROM sqlite_master WHERE type='table';

-- Check foreign keys enabled
PRAGMA foreign_keys;
-- Should return: 1

-- Check new columns
PRAGMA table_info(users);
PRAGMA table_info(inventory);
PRAGMA table_info(transactions);
```

---

## 🔐 Security Features

### What's New

1. **Authentication Required**
   - All API routes protected
   - Session-based authentication

2. **Rate Limiting**
   - Prevents brute force attacks
   - 5 login attempts per 15 minutes

3. **Account Lockout**
   - Account locks after 5 failed attempts
   - 15-minute lockout duration

4. **Audit Logging**
   - All sensitive actions logged
   - Tamper-evident logs

5. **Password Strength**
   - Enforced complexity requirements
   - No common passwords allowed

6. **Secure Electron**
   - Context isolation enabled
   - Node.js integration disabled in renderer
   - Content Security Policy enforced

---

## 🐛 Troubleshooting

### Issue: Can't login after upgrade

**Solution:**
1. Check console for temporary admin password
2. If not shown, reset manually:
   ```bash
   node scripts/reset-admin-password.js
   ```

### Issue: Database errors

**Solution:**
1. Check database file permissions
2. Verify database integrity:
   ```bash
   sqlite3 path/to/pharmacy.db "PRAGMA integrity_check;"
   ```
3. Restore from backup if needed

### Issue: Features not working

**Solution:**
1. Check browser console for errors (Ctrl+Shift+I)
2. Verify all files updated correctly
3. Clear application cache:
   - Windows: `%APPDATA%\PharmaSpot`
   - macOS: `~/Library/Application Support/PharmaSpot`
   - Linux: `~/.config/PharmaSpot`

### Issue: Custom integrations broken

**Solution:**
1. Update API calls to include authentication:
   ```javascript
   headers: {
     'X-User-Id': userId,
     'X-Session-Token': sessionToken
   }
   ```
2. See API documentation for details

---

## 📞 Support

If you encounter issues:

1. **Check logs**
   - Console output
   - Error logs in: `logs/error.log`

2. **Gather information**
   - Version number
   - Operating system
   - Error messages
   - Steps to reproduce

3. **Report issue**
   - GitHub: https://github.com/drkNsubuga/PharmaSpot/issues
   - Include all gathered information

---

## 🔄 Rollback Procedure

If you need to rollback to the previous version:

1. **Stop PharmaSpot**

2. **Restore database backup**
   ```bash
   cp PharmaSpot-backup-YYYYMMDD/data/pharmacy.db data/pharmacy.db
   ```

3. **Restore application files**
   ```bash
   rm -rf PharmaSpot
   mv PharmaSpot-backup-YYYYMMDD PharmaSpot
   ```

4. **Verify rollback**
   - Start PharmaSpot
   - Login with old credentials
   - Verify data integrity

**Warning:** Any data created with the new version will be lost!

---

## ✅ Verification Commands

After upgrade, verify everything is working:

```bash
# Check version
node -e "console.log(require('./package.json').version)"

# Check database
sqlite3 data/pharmacy.db "SELECT COUNT(*) FROM users;"
sqlite3 data/pharmacy.db "SELECT COUNT(*) FROM audit_log;"

# Check file permissions
ls -la data/pharmacy.db
ls -la .env

# Test API (while running)
curl http://localhost:PORT/api/
```

---

## 📚 Additional Resources

- [SECURITY.md](./SECURITY.md) - Security documentation
- [.env.example](./.env.example) - Environment configuration template
- [README.md](./README.md) - General documentation

---

**Last Updated:** 2024
**Version:** 1.6.0
