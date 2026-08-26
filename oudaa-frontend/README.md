# Oudaa — Community Fund Management System (Frontend)

A React + Tailwind frontend for the Oudaa Community Fund Management System:
residents, fees, payments, funds, projects, expenses, receipts, dashboards,
and reports — with role-based views for **Admin (committee)** and
**Resident**.

The app talks to the `oudaa-backend` API (Node/Express/Prisma/PostgreSQL)
over REST.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. By default the dev server proxies `/api`
requests to `http://localhost:4000` (see `vite.config.js`), so run
`oudaa-backend` alongside it. Use the demo buttons on the login screen, or
sign in with a seeded account, password `Password123!` for both:

- **Admin:** `admin@greenwood.example`
- **Resident:** `bob@greenwood.example`

(Seed these accounts by running `npm run seed` in `oudaa-backend` — see the
root README.)

## Configuration

- `src/lib/api.js` holds the Axios client and the full REST endpoint map
  (`/residents`, `/fees`, `/payments`, `/funds`, `/projects`, `/expenses`,
  `/receipts`, `/reports/*`, `/auth/login`, `/auth/register`, `/auth/me`,
  `/auth/refresh`). It attaches the JWT automatically from
  `localStorage['oudaa_token']` and transparently refreshes it on a 401
  using the backend's httpOnly refresh cookie.
- Set `VITE_API_URL` in a `.env` file if the API isn't reachable through
  the `/api` dev proxy — e.g. when pointing at a deployed backend, set it
  to something like `https://api.example.com/api/v1`.

## Structure

```
src/
  components/ui.jsx        Shared UI: StatCard, Badge, Modal, EmptyState, formatters
  context/AuthContext.jsx  Login/logout, role handling, session refresh
  context/DataContext.jsx  All Oudaa entities + CRUD actions, calling the real API
  layouts/AppLayout.jsx    Sidebar + topbar shell, role-aware nav
  lib/api.js               Axios instance + REST endpoint map
  lib/adapters.js          Translates between UI field names and the backend's schema
  pages/Login.jsx          Split-screen login
  pages/admin/*             Dashboard, Residents, Fees, Payments, Funds, Projects, Expenses, Receipts, Reports
  pages/resident/*          Read-only resident-facing views of the same modules
```

## Tech

React 18 · React Router 6 · Tailwind CSS · Recharts · Lucide icons · Axios
