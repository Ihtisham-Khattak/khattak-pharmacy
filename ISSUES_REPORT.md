# PharmaSpot — Full-Project Issues Report

**Scope:** Electron main process & packaging, Express/SQLite backend (`server.js`, `api/*.js`), frontend shell (`index.html`), core POS logic (`assets/js/pos.js`), support JS (`checkout.js`, `notifications.js`, `product-filter.js`, `utils.js`), database schema/migrations (`api/db.js`, `migrate-db.js`), and the test suite (`tests/`, root-level test scripts).

**App shape:** PharmaSpot is an Electron desktop POS. The renderer is a single static `index.html` shell (login screen + one main view + ~15 Bootstrap modals, shown/hidden — not routed) whose logic lives almost entirely in `assets/js/pos.js` (2,858 lines). The main process (`start.js`) also boots an embedded Express + better-sqlite3 server (`server.js`, `api/*.js`) that the renderer talks to over HTTP on a local port, with a "Network POS Terminal" mode implying other machines can point at that same server over LAN.

---

## How to read this

Findings are grouped by theme, each tagged with severity (Critical / High / Medium / Low) and file:line. "Critical" means directly exploitable data loss, financial fraud, unauthorized access, or silent real-money/data corruption. Severity reflects **impact if triggered**, not likelihood.

---

## 1. Critical Issues

### 1.1 No authentication or authorization anywhere on the backend API
`server.js` mounts every route (`/api/inventory`, `/api/customers`, `/api/users`, `/api/transactions`, `/api/settings`, `/api/out-of-stock`) with zero session/token middleware. Every create/update/delete endpoint — including deleting users, editing settings, and posting sales — is callable by anyone who can reach the port. The `perm_products`/`perm_users`/`perm_transactions`/`perm_settings` flags defined in the `users` schema (`api/db.js:122-126`) are written on user create/update but **never read by any route** — permission enforcement is purely cosmetic client-side UI hiding in `pos.js`.

### 1.2 Backend server is exposed on the LAN with wildcard CORS
`server.js:16-19,27-39,53`: a global rate limiter is the *only* gate; `Access-Control-Allow-Origin: *` is set on every response, and `server.listen(PORT, ...)` binds with no host argument, which defaults to `0.0.0.0` (all interfaces), not `127.0.0.1`. Combined with 1.1, **any device on the same Wi-Fi/LAN can `curl` the API directly** — no browser, no CORS bypass, no credentials needed — and read or write inventory, customers, transactions, and user accounts.

### 1.3 Password hashes are returned to API clients
`api/users.js` (`GET /user/:userId`, `GET /all`, and the login response) use `SELECT *` and send the row straight back, including the bcrypt `password` field, in every user-fetch response. Combined with 1.1/1.2, hashes are exfiltratable by anyone on the network for offline cracking.

### 1.4 Hardcoded default admin account (`admin` / `admin`)
`api/users.js` `/check` route auto-seeds user id 1 with username `admin`, password `admin` (bcrypt-hashed, but the plaintext is trivial), full permissions, and nothing forces rotation of that password. `migrate-db.js:174-176` separately seeds an id=1 admin with a **placeholder, non-functional bcrypt string** (`$2b$10$YourHashedPasswordHere`) — whichever code path fires first on a fresh DB determines whether the "admin" account is trivially guessable or permanently locked out.

### 1.5 Sale totals are fully trusted from the client
`api/transactions.js` (~lines 187-212): `total`, `paid`, `change`, `discount`, and `tax` are taken directly from the POST body (`parseFloat(t.total) || 0`) and are **never recomputed from `inventory.price × quantity`** server-side, never checked for negative values, and never validated against `discount ≤ total`. A client (or a `curl` from finding 1.2) can submit `{total:0, paid:0, items:[{id:5, quantity:100}]}`; inventory still decrements — undetectable inventory shrinkage / theft vector.

### 1.6 Electron renderer runs with full Node access and no isolation
`start.js:29-33`: `nodeIntegration: true, contextIsolation: false`, plus `@electron/remote` enabled on every window (`start.js:47-49`), no `sandbox: true`, no preload script, no `contextBridge` anywhere. This means **any HTML/script injected into the renderer is equivalent to full remote code execution** — filesystem, `child_process`, and Electron's `dialog`/`app`/`BrowserWindow` APIs are all directly `require()`-able from injected content. This single architectural choice upgrades every DOM-injection bug below from "XSS" to "RCE."

### 1.7 Systemic unescaped DOM injection of DB-sourced strings in `pos.js`
Given 1.6, these are RCE vectors, not cosmetic bugs. Raw, unescaped interpolation into `.html()`/template strings appears in: product/generic names (`pos.js:481-496, 1862-1874`), out-of-stock export rows (`pos.js:2639-2658, 2737-2743`), and the user list (`pos.js:1779-1793`). None of these pass through `DOMPurify.sanitize`/`validator.escape` first. Separately, the printed receipt template (`pos.js:907-1010, 2475-2578`) only sanitizes the *final* assembled HTML string — too late to stop an attribute-context breakout via `src='${logo}'` where `logo` comes from `settings.img`, which is only `validator.unescape`'d (decodes entities — the *opposite* of escaping) before being embedded.

### 1.8 No double-submit lock on checkout
`pos.js:1446-1456`: the `#confirmPayment` click handler calls `submitDueOrder(1)` directly; the button is only `disabled` *after* the receipt HTML has already been built synchronously (`pos.js:907-1010`). A fast double-click can queue two calls before the disable takes effect, each posting a separate transaction and decrementing stock twice for one sale.

### 1.9 User self-edit password confirmation never actually blocks a mismatch
`pos.js:2022-2062`: on a password mismatch the code shows a warning but has **no `return`**, so execution falls through into `bcrypt.compare(...)` used directly inside an `if` — but `bcrypt.compare()` returns a Promise, so the condition is always the truthy Promise object. This check **never rejects anything**; password confirmation on user edit is effectively a no-op.

### 1.10 `migrate-db.js` silently destroys non-numeric category data with no backup
`migrate-db.js:60-68`: category values are converted via `CASE WHEN category GLOB '[0-9]*' THEN CAST(category AS INTEGER) ELSE NULL END` — any human-readable category text (e.g. `"Antibiotics"`, `"OTC"`) becomes `NULL`, permanently, with the old table dropped in the same transaction (`migrate-db.js:71`) and **no file-level backup taken anywhere in the script** before the destructive rewrite. No per-row logging of what was discarded.

### 1.11 Live production database is committed to git
`data/pharmacy.db` is tracked in git (confirmed via `git log -- data/pharmacy.db`, 6+ commits touching the binary file) and is **not** in `.gitignore`. Real inventory/customer/transaction data risks being versioned and pushed to any remote; every clone also ships pre-seeded/stale data, and the binary blob bloats history on every change.

### 1.12 Test suite cannot run at all
`jest.config.ts` requires TypeScript config support, which needs `ts-node` — **not listed in `package.json` devDependencies**. `npm test` fails immediately with `Jest: 'ts-node' is required...` before a single test executes. Every other finding about "test coverage" below is moot until this is fixed — there is currently **zero working automated verification** for this codebase.

---

## 2. High Severity

| # | Area | Finding |
|---|------|---------|
| H1 | Backend | Sale insert and inventory decrement in `api/transactions.js` are two separate operations, not wrapped in one `db.transaction()` — a failure mid-way (e.g. deleted product id) commits the sale but skips the stock adjustment, corrupting sales/inventory reconciliation. |
| H2 | Backend | `UPDATE inventory SET quantity = quantity - ?` (`api/inventory.js`) has no `WHERE quantity >= ?` guard — normal sequential overselling can drive stock negative. Mirrors a frontend gap: `qtInput` (`pos.js:704-708`) accepts any typed quantity with **no stock check at all**, unlike the `+`/`-` buttons which do check. |
| H3 | Backend | No refund/void endpoint exists. `POST /delete` in `api/transactions.js` just `DELETE`s the row — inventory is never restored and the audit trail is permanently lost. |
| H4 | Backend | `PUT /new` (transaction update) skips essentially all the validation `POST /new` has — no existence checks, no numeric coercion, never re-syncs inventory if item quantities changed. |
| H5 | Backend | `api/settings.js` imports `filterFile` from `assets/js/utils.js` for multer's `fileFilter`, but that function **is never exported** from utils.js — `fileFilter` silently resolves to `undefined`, so the store-logo upload accepts any file type despite appearing to validate images. |
| H6 | Frontend | `qtDecrement` (`pos.js:696-702`) checks the **stale global `item`** (left over from the previous cart interaction) *before* reassigning `item = cart[i]` — copy-paste bug (compare to `qtIncrement`, which correctly reassigns first). Decrementing one cart line can be silently gated by an unrelated line's leftover quantity. |
| H7 | Frontend | All cart/checkout money math (`calculateCart`, `pos.js:588-621`) uses raw JS floating-point arithmetic with only a final `.toFixed(2)` — classic float-accumulation errors persist into the saved transaction record. |
| H8 | Frontend | Discount field (`pos.js:597`) is read via untyped `.val()` with no `parseFloat`/`isNaN` guard — a non-numeric or empty discount silently becomes `NaN`, propagating into totals shown and posted to the backend. No percentage-discount mode exists at all, only flat amount. |
| H9 | Frontend | `isExpired()` (`utils.js:12-15`) calls `moment(dueDate)` with **no format string**, while the sibling `daysToExpire()` correctly uses `moment(dueDate, DATE_FORMAT)`. Dates are stored as `DD-MMM-YYYY`; moment's fuzzy fallback parsing on that format is unreliable — **expired medication may not be flagged as expired**, a direct patient-safety/compliance concern for a pharmacy. |
| H10 | Frontend | `calculateChange` (`checkout.js:35-36`) strips commas via non-global `.replace(",", "")`, removing only the *first* separator. For totals ≥ 1,000,000 (two comma groups), `parseFloat` silently truncates the value — change-due calculation corrupts for large sales. |
| H11 | Frontend | `product-filter.js` (search across POS grid, held orders, customer orders) builds `new RegExp($("#search").val(), "gi")` directly from raw keystrokes with no escaping and no try/catch. Typing an unbalanced regex metacharacter (plausible in real product names, e.g. `"Panadol (500mg)"`) throws on every keystroke and **breaks live search** until the character is removed. |
| H12 | Electron | CI explicitly sets `CSC_IDENTITY_AUTO: false` in both `build.yml` and `release.yml`, and no `certificateFile`/`cscLink` is configured anywhere — **release installers are unsigned**. `electron-updater`'s main integrity gate (Authenticode verification) is effectively disabled; only the `sha512` hash in `latest.yml` protects update authenticity. |
| H13 | Database | `inventory.id` and `users.id` use bare `INTEGER PRIMARY KEY` (no `AUTOINCREMENT`) while `categories`/`customers`/`out_of_stock_products` do use it — SQLite can **reuse a deleted row's rowid** on these two tables. Since `transactions.items` stores product references as an unstructured JSON snapshot with no FK check, a reused `inventory.id` after a delete can make historical sales records silently point at the *wrong* product. |
| H14 | Database | `transactions.items` (`api/db.js:144`) is a serialized JSON blob, not a normalized line-items table — no FK integrity to `inventory.id`, and any per-product sales reporting (units sold, revenue by SKU) requires pulling every row and parsing JSON in application code rather than a SQL `JOIN`/`SUM`. |
| H15 | Testing | Zero route-level/integration tests exist for any `api/*.js` file. All four real Jest suites either hit the DB layer directly (bypassing Express, validation, auth) or mock the DOM entirely — none of the actual HTTP handlers (login, permission checks, error formatting) are exercised. |
| H16 | Testing | `test-api.js` and `test-inventory.js` in the repo root are manual `console.log` smoke scripts (no `describe`/`it`/`expect`), not matched by Jest's default `testMatch` (wrong filename pattern), and not part of `tests/` — dead files that look like coverage but provide none. |
| H17 | Backend/DB | `DELETE` routes for categories and users (`api/categories.js`, `api/users.js`) let raw `SQLITE_CONSTRAINT_FOREIGNKEY` errors bubble up as generic 500s with the driver's message exposed to the client, instead of a friendly "still in use" 409 — because `inventory.category_id` and `transactions.user_id` have no `ON DELETE` clause. |
| H18 | Database | `migrate-db.js` has no schema-version tracking (no `PRAGMA user_version`/migrations table), is not safely re-runnable after a partial failure, reorders FK-dependent table rebuilds in a way that can transiently orphan references, and never runs `PRAGMA foreign_key_check` before commit. No pre-migration file backup exists anywhere in the script. |
| H19 | Electron | `ipcMain.on("restart-app")` (`start.js:83-85`) calls `autoUpdater.quitAndInstall()`, but `autoUpdater` is **never imported in `start.js`** — triggering this channel throws `ReferenceError`, crashing the update-install flow (only caught by the generic `uncaughtException` logger, so it fails silently from the user's perspective). |
| H20 | Electron | `menuController.js:76` references undeclared `releaseNotes`/`releaseName` globals in the update-available dialog instead of reading them off the `info` parameter — throws `ReferenceError` the moment an update is actually found, breaking the update-notification UX (compounds H19: even if the dialog worked, installing the update crashes anyway). |

---

## 3. Medium Severity

- **No/inconsistent `ON DELETE` policy** across foreign keys (`api/db.js`) — `inventory→categories` and `transactions→users/customers` default to `NO ACTION` (blocks deletes, see H17), while `out_of_stock_products→inventory` cascades — an inconsistent, undocumented deletion policy.
- **Disabled user accounts can still log in** — the `users.status` field is never checked at the `/login` route.
- **No negative-value validation** on price, quantity, minStock, discount, or tax anywhere in the API layer.
- **`NaN` silently becomes `0`** for a missing transaction total (`parseFloat(t.total) || 0`) instead of rejecting the request — records a valid $0 sale.
- A cart item with a **non-numeric id is skipped but still persisted** into the stored `items` JSON, later crashing `decrementInventory` *after* the transaction row is already committed.
- **Global rate limiter (100 req/15 min)** applies uniformly to every route, including live product search/autocomplete — normal single-cashier usage during a busy shift can self-trigger 429s.
- No global Express error-handling middleware; since the server runs inside the Electron main process, an unhandled route exception risks taking down the whole app, not just the request.
- **Backup restore overwrites live DB/upload files** (`menuController.js:291-325`) without stopping the running server/closing the `better-sqlite3` connection first — risk of corrupting the freshly-restored database if triggered while the app is in active use.
- The restore flow's zip **path-traversal guard is implemented correctly**, but it `throw`s inside an async `.on('entry', ...)` stream callback (`menuController.js:242`) — that throw isn't caught by the surrounding `try/catch`, so a blocked traversal attempt hangs the UI instead of showing "Restore Failed."
- **Three parallel, conflicting packaging pipelines** coexist (electron-forge, electron-builder config in `package.json`, and a raw `electron-packager` script) with different `asar` settings and app IDs; only electron-forge (`npm run make`/`publish`) is actually invoked by CI — the other two are unmaintained dead config that could mislead a local build.
- The electron-forge **GitHub publisher targets `drkNsubuga/PharmaSpot`**, a different owner than the app's stated author (`Patterns Digital Limited`) and update-feed domain (`download.pharmaspot.patternsdigital.com`) — `npm run publish` likely ships artifacts nobody's running app ever fetches.
- `migrate-db.js`'s placeholder admin bcrypt hash (`$2b$10$YourHashedPasswordHere`) creates a **permanently unusable admin account** if that `INSERT OR IGNORE` path fires on an empty users table.
- `installers/setupEvents.js` wraps `child_process.spawn` in a **silently-swallowing empty catch** — shortcut creation/removal failures during install/uninstall are invisible, with no logging.
- Tests run directly against the **real, git-committed `data/pharmacy.db`** rather than an isolated temp/in-memory DB, with manual `DELETE ... WHERE id LIKE 'TEST_%'` cleanup that leaves orphaned rows behind on any crashed test run.
- `fk-constraints.test.js`'s walk-in-customer (`customer_id = 0`) test asserts `toBeGreaterThanOrEqual(0)` — a condition that **always passes**, masking an acknowledged-in-comments unresolved schema question.
- `assets/js/notifications.js` (`NotificationHelper`, 181 lines) is **never bundled or required anywhere** — fully dead code, despite `NOTIFICATIONS_README.md` describing it as an actively integrated system.
- Receipt "Paid/Change" HTML is rebuilt by regex-stripping `<td>`/`<b>` tags out of an already-built fragment (`pos.js:985-991, 2553-2558`) rather than constructing it cleanly — any future markup change silently breaks printed receipts.
- `viewTransaction` (`pos.js:2413-2586`) assumes `customer` is always an object, while other code paths (`renderHoldOrders`) defensively handle it as a possibly-JSON-string field — inconsistent, can throw on render with no try/catch.
- **Widespread missing AJAX error handlers** across `pos.js` (category/user/product loads, deletes, hold-orders) — network failures or non-200 responses fail silently with no user feedback, particularly bad for the "Network POS Terminal" mode where the API host is a separate machine.
- Tax rate (`vat`) is loaded via a **hardcoded 1500ms `setTimeout`** instead of chaining off the settings AJAX callback (`pos.js:382-389`) — on a slow network, tax calculations silently use `0`/`NaN` for an indeterminate window after launch.
- A shared mutable global `item`/`index` (`pos.js:19, 573-586`) is reused across many unrelated `$.each` callbacks throughout the file — real risk of one async operation clobbering state another is mid-way through using.
- `calculatePrice` (hold-order totals) uses `.toFixed(0)` while every other money computation in the file uses `.toFixed(2)` — rounding-inconsistent totals between the order list and detail view.

---

## 4. Low Severity / Hygiene

- Raw SQLite error messages (including schema/table names) are leaked verbatim in HTTP error responses across every `api/*.js` route.
- `out_of_stock` update routes return `200 OK` even when the update affected 0 rows (stale/deleted id) — client believes the save succeeded.
- Negative `minStock` is permitted, which can make `quantity <= minStock` false even at zero stock, hiding real stockouts from the reorder dashboard.
- `validator.escape()` is applied at **persistence time** rather than render time in `inventory.js`/`settings.js` — product names containing `&`, `'`, `<` get permanently HTML-entity-corrupted in the database, breaking receipts and name search.
- Duplicate `id` attributes in `index.html` (`#counter` ×4, `#basic-addon3` ×3, `#mySmallModalLabel` ×9, `#mySmallModalLabel` ×3) — invalid HTML; currently harmless because lookups are scoped, but a landmine for any future `getElementById`/library code, and degrades screen-reader `aria-labelledby` correctness.
- `checkout.js`'s numeric keypad (`$.fn.digits`) allows multiple decimal points to be typed with no guard — cosmetic display glitch, recovered gracefully by `parseFloat` downstream.
- Fully-wired but **unreachable UI**: the "New Customer" nav entry and the entire Customer Orders modal (`#customerModal`) are commented out of navigation in `index.html`, yet their JS (`searchCustomerOrders` etc.) ships and runs — dead feature surface.
- `gulp-javascript-obfuscator` is a declared devDependency but never used in `gulpfile.js` — only `uglify` (minification, not obfuscation) runs; misleading if anyone assumes renderer JS is obfuscated.
- Update-check failure dialog (`menuController.js:114`) passes a raw `Error` object into `dialog.showMessageBox`'s `detail` field, which expects a string — likely renders as `[object Object]` or a broken dialog.
- No `default:` case in `setupEvents.js`'s Squirrel event switch — an unhandled event like `--squirrel-firstrun` falls through silently (currently benign, since install/updated already handle shortcuts).
- `transactions.change` is a reserved-word-adjacent column name (reserved in MySQL/other engines) — a portability landmine if ever migrated off SQLite.
- Payment-type switch (`pos.js:846-855`) only handles cases `1` (Cash) and `3` (Card); any other value silently mislabels the receipt as "Cash."
- Hardcoded `till: 1` in the non-network settings form submission contradicts the same code's own till-number validator used for the network settings form — leftover/dead default.
- Full DOM rebuild (`.empty()` + re-append) on every single quantity keystroke/click in the cart, re-baking `index` into inline `onclick` strings — a stale-index risk if an async response resolves after the cart has already re-rendered, plus unnecessary re-render cost for large carts.
- Notiflix expiry-warning toast fires once per near-expiry product on **every debounced search keystroke**, stacking repeated toasts rather than de-duplicating per session.
- Dead/commented-out customer-dropdown code left alongside live code that still manipulates the same DOM elements.

---

## 5. Priority Recommendations

If only a handful of things get fixed, fix these first — they compound each other into the worst outcomes:

1. **Add real authentication + server-side permission enforcement** to every API route (1.1, 1.5, 2.x perm flags), and bind the server to `127.0.0.1` unless "Network Terminal" mode is explicitly enabled with its own auth (1.2).
2. **Remove `admin`/`admin` and the broken placeholder-hash seed**; force a password set on first run (1.4).
3. **Recompute financial totals server-side** from stored `inventory.price` rather than trusting client-submitted amounts (1.5), and wrap sale-insert + inventory-decrement in one `db.transaction()` with an oversell guard (H1, H2).
4. **Move to `contextIsolation: true` + a preload script with `contextBridge`**, and audit/fix every unescaped `.html()`/template-string DOM write in `pos.js` (1.6, 1.7, 1.9 attribute-context issue) — this is the single highest-leverage architectural fix given how many other findings it amplifies.
5. **Get the test suite running again** (install `ts-node` or drop the TS config) and add API/route-level tests before making the above changes, so regressions are caught (1.12, H15).
6. **Stop committing `data/pharmacy.db`** — add it to `.gitignore`, and consider scrubbing it from history if it contains real data (1.11).
7. **Add a pre-migration backup step to `migrate-db.js`** and stop silently discarding non-numeric category data (1.10, H18).
