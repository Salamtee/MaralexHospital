# MARALEX Allied — Inventory & Sales Management System

A real, database-backed system (not a demo) for MARALEX Allied Hospital and
Educational Services: pharmaceutical & medical inventory, an inventory-linked
Sales/POS, suppliers, patients/customers, stock adjustments, sales reports
with PDF export, staff accounts, and role-based login (Pharmacist /
Supervisor).

Stack: **HTML/CSS/JavaScript** frontend, **Node.js + Express** API,
**MongoDB (Atlas)** database. Installable as a **PWA** on phones and
tablets.

The system ships completely empty — no sample products, sales, suppliers,
customers or stock adjustments. Only the two staff login accounts are
seeded (see below), matching your original prototype's demo logins.

## 1. Install dependencies

```
cd backend
npm install
```

## 2. Configure your database

Copy the example environment file:

```
cp .env.example .env
```

Open `.env` and replace `<db_password>` in `MONGODB_URI` with your real
Atlas database-user password (URL-encode any special characters like
`@ : / ? # [ ]`). Your connection string, from your Atlas cluster
"Maralex-Hospital", is already filled in — a database name
(`maralex_allied`) was added to the end of the host so your collections
have a home; change it if you'd rather use a different name.

Also set `JWT_SECRET` to a long random string — this signs login sessions.

## 3. Seed the two staff login accounts

This creates **only** the login accounts — no inventory, sales, or other
records:

```
npm run seed
```

This creates:

| Role       | Phone (login) | Password    | Access |
|------------|---------------|-------------|--------|
| Pharmacist | `0760000001`  | `Pharm@123` | Full work |
| Supervisor | `0760000002`  | `Super@123` | Full work + Manage Staff |
| Owner      | `0760000003`  | `Owner@123` | **View-only** (cannot create/edit/delete) |

**Change both passwords after your first login** (My Profile → Change
Password). Running `npm run seed` again is safe — it skips accounts that
already exist.

## 4. Run the server

```
npm start
```

The API and the frontend are both served from the same server, by
default at **http://localhost:5000**. Open that URL in a browser to use
the system. For development with auto-restart on file changes:

```
npm run dev
```

## 5. Install it as an app (PWA)

Once the server is running and you open it in Chrome/Edge (desktop) or
Chrome/Safari (Android/iPhone/iPad):

- **Desktop Chrome/Edge:** click the install icon in the address bar.
- **Android:** browser menu → "Install app" / "Add to Home screen".
- **iPhone/iPad (Safari):** Share button → "Add to Home Screen".

The layout is responsive at every width, from phones to tablets to
desktop monitors.

## What was intentionally left out of this build

- **Deployment/hosting** — this gives you a system that runs locally or on
  any Node-capable host (Render, Railway, a VPS, etc.); you'll need HTTPS
  in production for the PWA install prompt to appear on most browsers.
- **Email fields** — left out throughout, matching your original prototype.

## Project structure

```
maralex-system/
├── backend/            Express API (auth, inventory, sales, reports...)
│   ├── config/db.js
│   ├── models/          Mongoose schemas
│   ├── routes/          REST endpoints
│   ├── middleware/auth.js
│   ├── utils/seed.js    Creates ONLY the two login accounts
│   └── server.js
└── frontend/           Static HTML/CSS/JS + PWA files
    ├── index.html
    ├── css/styles.css
    ├── js/api.js         Talks to the backend
    ├── js/app.js         UI logic
    ├── manifest.json
    └── service-worker.js
```

## Roles

- **Pharmacist** — full operational access (inventory, sales, purchases, expenses, prescriptions, bank, etc.).
- **Supervisor** — everything Pharmacist can do, plus **Manage Staff**.
- **Owner** — can **view all screens and data** but cannot create, edit or delete anything (read-only oversight).

### Bank Transactions
- Summary cards: Opening Balance, Total Deposits (academic year), Total
  Withdrawals (academic year), current Bank Balance.
- Ledger of all deposits / withdrawals with date, bank, purpose, slip
  reference and who recorded it.
- **Record Transaction** modal (Deposit / Withdrawal).
- **Set Opening Balance** (one record; replaces previous).
- Academic year is treated as 1 Sep → 31 Aug.

### Purchases / Goods Received
- Record stock received from suppliers with multi-line items.
- Automatically increases inventory quantities and updates unit cost.
- Optional: create a matching **bank withdrawal** for the purchase total.
- Deleting a purchase reverses the stock increase.

### Expenses
- Track operating costs by category (Utilities, Salaries, Rent, Transport, etc.).
- Summary cards: total expenses, top category, this month.
- Optional: create a matching **bank withdrawal**.
- Filter by category.


## Security notes for going live

- Passwords are hashed with bcrypt; sessions use signed JWTs.
- Put `.env` in `.gitignore` (already done) — never commit real credentials.
- Restrict your MongoDB Atlas Network Access list to the IP(s) that will
  run this server.
- Serve over HTTPS in production.

### Prescriptions / Dispensing
- Create prescriptions with patient, doctor, diagnosis and multiple medicines.
- Dispense partially or fully — stock is reduced on dispense.
- Statuses: Pending → Partially Dispensed → Dispensed (or Cancelled).

### Purchase Order Workflow
- Create as **Goods Received** (stock now) or **Purchase Order** (receive later).
- Receive goods on a PO to add stock; cancel reverses any partial receipts.

### Slip File Upload
- Bank transactions accept an optional image/PDF slip (stored under `/uploads`).

### Audit Log
- System-wide activity log: who created, updated, dispensed, received, etc.

### Profit & Loss Report
- Under Sales Reports → switch to **Profit & Loss**.
- Revenue − COGS − Expenses = Net Profit/Loss for any date range.
