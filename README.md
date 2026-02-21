
# PharmaSpot Point of Sale
![GitHub package.json version](https://img.shields.io/github/package-json/v/drkNsubuga/PharmaSpot) ![GitHub all releases](https://img.shields.io/github/downloads/drkNsubuga/PharmaSpot/total) [![Build](https://github.com/drkNsubuga/PharmaSpot/actions/workflows/build.yml/badge.svg)](https://github.com/drkNsubuga/PharmaSpot/actions/workflows/build.yml) [![Release](https://github.com/drkNsubuga/PharmaSpot/actions/workflows/release.yml/badge.svg)](https://github.com/drkNsubuga/PharmaSpot/actions/workflows/release.yml) [![GitHub issues](https://img.shields.io/github/issues/drkNsubuga/PharmaSpot)](https://github.com/drkNsubuga/PharmaSpot) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/drkNsubuga/PharmaSpot/blob/main/LICENSE)

![PharmaSpot Logo](assets/images/logo.svg)

PharmaSpot is a cross-platform Point of Sale system designed for pharmacies and built to streamline operations and enhance customer service.

> **🔒 Version 1.6.0 - Security Update**
> This version includes critical security improvements. Please read [UPGRADE.md](./UPGRADE.md) before updating from previous versions.

## Features

✔️ **Multi-PC Support:** Allows multiple computers on a network to access a central database, ensuring data consistency across all locations.

✔️ **Receipt Printing:** Generate professional receipts for your customers, making transactions more convenient.

✔️ **Product Search:** Quickly find products by scanning barcodes, simplifying inventory management.

✔️ **Staff Accounts and Permissions:** Create user accounts with various permission levels to control access and actions within the system.

✔️ **Product and Category Management:** Easily manage your products and categorize them for efficient organization.

✔️ **User Management:** Administer and maintain user accounts for your staff members.

✔️ **Basic Stock Management:** Keep track of your inventory and update stock levels as needed.

✔️ **Open Tabs and Orders:** Manage open tabs and orders to accommodate customer preferences.

✔️ **Customer Database:** Maintain a customer database to personalize interactions and build loyalty.

✔️ **Transaction History:** Access a comprehensive record of all transactions for reference and reporting.

✔️ **Transaction Filtering:** Filter transactions by till, cashier, or status, providing valuable insights into your sales.

✔️ **Date Range Filtering:** Narrow down transactions based on specific date ranges for in-depth analysis.

✔️ **Custom Barcode Support:** Define custom barcodes for products, enhancing flexibility in inventory management.

✔️ **Product Expiry Date Tracking:** Keep an eye on product expiry dates to prevent sales of expired items.

✔️ **Profit Calculation:** Calculate profit per item and total profit, helping you make informed business decisions.

✔️ **Low Stock Alerts:** Receive alerts for low stock levels to avoid running out of popular products.

✔️ **Expiry Date Alerts:** Stay informed about product expiration dates, reducing waste and potential liabilities.

✔️ **Improved UI** Enjoy a fresh, modern look with enhanced display quality, making the user experience more appealing.

---

## 🔐 Security Features (New in v1.6.0)

### Authentication & Authorization
- ✅ **Strong Password Policy** - Minimum 8 characters with complexity requirements
- ✅ **Account Lockout** - Protects against brute force attacks (5 attempts max)
- ✅ **Session Management** - Secure session tokens with automatic expiration
- ✅ **Permission-Based Access** - Granular control over user permissions
- ✅ **Forced Password Change** - Default passwords must be changed on first login

### Data Protection
- ✅ **Audit Logging** - All sensitive actions are logged for compliance
- ✅ **Database Integrity** - Foreign key constraints and data validation
- ✅ **Secure Backups** - Backup/restore with SHA256 integrity verification
- ✅ **Input Validation** - All user inputs validated and sanitized

### Application Security
- ✅ **Secure Electron** - Context isolation, disabled Node.js in renderer
- ✅ **Rate Limiting** - Prevents abuse and DoS attacks
- ✅ **API Protection** - All endpoints require authentication
- ✅ **Content Security Policy** - Prevents XSS and injection attacks

📖 **See [SECURITY.md](./SECURITY.md) for complete security documentation**

---

## Demo

[PharmaSpot Video Preview](https://github.com/drkNsubuga/PharmaSpot/assets/12871099/14e32721-b5d6-4186-bb63-be59733862c3)

| **Point of Sale** |  **Payment Point** |
|--|--|
|<img src="screenshots/pos.png" alt="PharmaSpot Demo - POS" width="80%"/>  |<img src="screenshots/payment.png" alt="PharmaSpot Demo - Payment" width="80%"/>|
| **Receipt** |  **Transactions** |
| <img src="screenshots/receipt.png" alt="PharmaSpot Demo-Receipt" width="80%"/>| <img src="screenshots/transactions.png" alt="PharmaSpot Demo - Transactions" width="80%"/>|
| **Status Alerts** | **More on the Roadmap** |
|<img src="screenshots/alerts.png" alt="PharmaSpot Demo - Status Alerts" width="80%"/>| <ul><li>Auto Updates</li><li>Back up</li><li>Restore</li><li>Export to excel</li></ul>


## Getting Started

### Installation

1. **Download** [PharmaSpot](https://github.com/drkNsubuga/PharmaSpot/releases/latest)
2. **Unzip** the package to a location of your choice
3. **Click** the `PharmaSpot` executable in the folder

### First-Time Setup

> ⚠️ **IMPORTANT - Security Update v1.6.0**
> 
> The default admin password is now randomly generated on first run for security.

**For Development:**
- Check the console output for the temporary admin password
- You will be forced to change it on first login

**For Production:**
- See [UPGRADE.md](./UPGRADE.md) for deployment instructions
- Configure `.env` file from `.env.example` template

### Default Login (Development Only)

- **Username:** `admin`
- **Password:** (shown in console on first run - **must be changed**)

---

## For Developers

### Quick Start

```bash
# Clone the repository
git clone https://github.com/drkNsubuga/PharmaSpot.git
cd PharmaSpot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your settings

# Start the application
npm run start

# Build CSS and JS assets
gulp

# Run tests
npm test
```

### Development Requirements

- Node.js 18+ 
- npm or yarn
- For building: electron-forge

### Project Structure

```
PharmaSpot/
├── src/
│   ├── main/           # Electron main process
│   ├── server/         # Express backend
│   │   ├── middleware/ # Auth, rate limiting, error handling
│   │   ├── validators/ # Input validation
│   │   └── db/         # Database layer
│   └── config/         # Configuration
├── api/                # API routes
├── assets/             # Frontend assets
├── data/               # Database storage
├── logs/               # Application logs
└── backups/            # Backup storage
```

### Documentation

- [Security Documentation](./SECURITY.md)
- [Upgrade Guide](./UPGRADE.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)

---

## Credits

Adapted from [tngoman](https://github.com/tngoman/Store-POS).

Feel free to report any issues or suggest enhancements via [GitHub Issues](https://github.com/drkNsubuga/PharmaSpot/issues).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. Take a moment to review the [Contributing Guidelines](https://github.com/drkNsubuga/PharmaSpot/blob/main/CONTRIBUTING.md).

## License

PharmaSpot Point of Sale is licensed under the [MIT License](https://github.com/drkNsubuga/PharmaSpot/blob/main/LICENSE).
