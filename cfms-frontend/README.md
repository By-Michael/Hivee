# CFMS — Community Fund Management System (Frontend)

A complete React + Tailwind frontend for the Community Fund Management System, built to the
Version 1 spec: residents, fees, payments, funds, projects, expenses, receipts, dashboards, and reports —
in a white-and-blue theme with role-based views for **Admin (committee)** and **Resident**.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. Use the demo buttons on the login screen, or:

- **Admin:** `admin@cfms.dev` / `admin123`
- **Resident:** `resident@cfms.dev` / `resident123`

## Connecting your real backend

The app ships in **mock mode** so it's fully usable standalone (data lives in `localStorage`).
To wire it to your Node.js/Express + PostgreSQL backend:

1. In `src/context/AuthContext.jsx`, set `export const MOCK_AUTH = false`.
2. In `src/context/DataContext.jsx`, set `export const MOCK_MODE = false`, then replace each
   action (`addResident`, `updatePayment`, etc.) with a call through `src/lib/api.js`, e.g.:

   ```js
   addResident: async (r) => {
     const { data } = await api.post(endpoints.residents(), r)
     setData((d) => ({ ...d, residents: [data, ...d.residents] }))
   }
   ```

3. `src/lib/api.js` already has the full REST endpoint map matching the CFMS core modules
   (`/residents`, `/fees`, `/payments`, `/funds`, `/projects`, `/expenses`, `/receipts`, `/reports/*`,
   `/auth/login`, `/auth/register`, `/auth/me`) and attaches your JWT automatically from
   `localStorage['cfms_token']`.
4. Set `VITE_API_URL` in a `.env` file if your API isn't proxied through `/api` (see `vite.config.js`
   for the dev proxy to `http://localhost:4000`).

## Structure

```
src/
  components/ui.jsx        Shared UI: StatCard, Badge, Modal, EmptyState, formatters
  context/AuthContext.jsx  Login/logout, role handling
  context/DataContext.jsx  All CFMS entities + CRUD actions (swap to real API here)
  layouts/AppLayout.jsx    Sidebar + topbar shell, role-aware nav
  lib/api.js               Axios instance + REST endpoint map
  pages/Login.jsx          Split-screen login
  pages/admin/*             Dashboard, Residents, Fees, Payments, Funds, Projects, Expenses, Receipts, Reports
  pages/resident/*          Read-only resident-facing views of the same modules
```

## Tech

React 18 · React Router 6 · Tailwind CSS · Recharts · Lucide icons · Axios
