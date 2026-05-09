# PharmaSpot POS: Analysis & Enhancement Plan

## 1. Executive Summary
PharmaSpot is a functional Electron-based POS system, but it currently carries significant technical debt—most notably the storage of transaction items as JSON blobs and a lack of robust security and audit trails. This plan outlines a roadmap to transition PharmaSpot into a professional, compliant, and scalable pharmacy management solution. Key focus areas include database normalization, security hardening, pharmacy-specific regulatory features, and modernizing the frontend/backend stack for better maintainability.

## 2. Priority 1: Security & Compliance
*   **Authentication & RBAC:** Replace simple permission toggles with a full Role-Based Access Control (RBAC) system. Roles: `Admin`, `Pharmacist`, `Cashier`.
*   **Audit Logging:** Implement a dedicated `audit_log` table to track all sensitive operations (price changes, stock edits, deletions).
*   **Data Encryption:** Use SQLCipher to encrypt the SQLite database at rest, protecting sensitive patient data.
*   **Secure API:** Transition to JWT (JSON Web Tokens) for internal API authentication between the renderer and main processes.

## 3. Priority 2: Database Normalization
### Junction Table: `transaction_items`
Currently, items are stored as JSON in `transactions.items`. This prevents efficient SQL reporting and data integrity.
```sql
CREATE TABLE transaction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL, -- Captured at time of sale
  total REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES inventory(id)
);
```

### Audit Trail Table: `audit_log`
```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL, -- 'UPDATE_PRICE', 'DELETE_USER', etc.
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_values TEXT, -- JSON snapshot
  new_values TEXT, -- JSON snapshot
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Inventory Enhancements
Add fields to `inventory`: `cost_price`, `supplier_id`, `barcode` (UNIQUE), `requires_prescription` (BOOLEAN), `controlled_substance_class`.

## 4. Priority 3: Pharmacy-Specific Features
*   **Prescription Management:** Link transactions to a `prescriptions` table containing Doctor name, Patient ID, and scanned image attachments.
*   **Batch/Lot Tracking:** Track `batch_number` and `manufacture_date` to facilitate recalls and monitor expiration more granularly.
*   **Drug Interaction Alerts:** Integration with a drug database API (e.g., RxNav) to warn cashiers of potential drug-to-drug interactions during checkout.
*   **Low Stock & Expiry Notifications:** A system-tray notification service that alerts staff even when the main window is minimized.

## 5. Priority 4: Modernization & DevEx
*   **TypeScript Migration:** Port the Backend/API logic to TypeScript to eliminate type-related bugs in critical financial calculations.
*   **Frontend Modernization:** Migrate from jQuery to **React + Vite**. This will allow for a more modular UI and better state management for the complex POS cart.
*   **CI/CD Pipeline:** GitHub Actions for automated testing (Jest) and multi-platform builds (Windows, Linux, macOS).
*   **Dockerization:** Provide a `Dockerfile` for the development environment to ensure all contributors have identical native build tool setups.

## 6. Questions for the Owner
1. Is this for single-pharmacy use or multi-branch chains (requiring Cloud Sync)?
2. Which region's pharmacy regulations must we comply with? (FDA, EMA, local?)
3. What are the legal requirements for data retention in your jurisdiction (e.g., 7 years)?
4. Is there a mobile app companion for managers in the roadmap?
5. Are you open to migrating SQLite to PostgreSQL for multi-user/cloud scenarios?
6. Do you require integration with local insurance providers or government health systems?
7. Should the system enforce prescription attachments for specific drug classes?
8. What is the expected peak volume of transactions per hour?
9. Is "Offline-First" capability a requirement for locations with spotty internet?
10. Are external payment gateway integrations (e.g., Stripe, Square) required?
