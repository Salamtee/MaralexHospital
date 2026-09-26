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

| Role       | Username     | Password    |
|------------|--------------|-------------|
| Pharmacist | `pharmacist` | `Pharm@123` |
| Supervisor | `supervisor` | `Super@123` |

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

- **Pharmacist** — dashboard, inventory, sales/POS, reports, suppliers,
  customers, stock adjustments, own profile.
- **Supervisor** — everything above, plus **Manage Staff** (create, edit,
  delete Pharmacist/Supervisor accounts). At least one Supervisor account
  is always kept.

## Security notes for going live

- Passwords are hashed with bcrypt; sessions use signed JWTs.
- Put `.env` in `.gitignore` (already done) — never commit real credentials.
- Restrict your MongoDB Atlas Network Access list to the IP(s) that will
  run this server.
- Serve over HTTPS in production.
