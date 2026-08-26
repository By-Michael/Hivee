# Oudaa — Community Fund Management System

Oudaa is a full-stack app for managing a residential community's shared
funds: resident registration, fee schedules, payments, funds, projects,
expenses, receipts, dashboards, and reports. It supports role-based access
for **Admin (committee)** and **Resident** users.

## Stack

- **Backend** (`oudaa-backend/`): Node.js, Express, Prisma ORM, PostgreSQL,
  JWT authentication (short-lived access token + httpOnly refresh cookie).
- **Frontend** (`oudaa-frontend/`): React 18, Vite, Tailwind CSS, React
  Router, Recharts, Axios.

The frontend talks to the backend over a REST API mounted at `/api/v1`.

## Features

- Resident management, including profile details (phone, ID number,
  address, owner/renter type) and a per-resident summary view showing
  any fees they haven't paid.
- Fee schedules, payments (with verification workflow), funds, projects,
  and expenses.
- Receipt uploads tied to expenses.
- Admin dashboard and reports.
- Append-only audit log (`GET /api/v1/audit-logs`) of every create/update/
  delete a committee member performs — no edit or delete endpoint exists
  for this resource by design.

## Known limitations (schema gaps)

A few fields the UI displays aren't first-class database columns; they're
either derived or stored elsewhere. None of these block normal use — just
worth knowing if you're extending the schema:

| UI field | Status |
|---|---|
| `fund.balance` | Not stored — computed live from `GET /funds/:id/summary` (allocated − spent across the fund's projects). |
| `fund.category` | Stored in `Fund.description` (a free-text column being reused). |
| `receipt.verified` | Not in the `Receipt` model — client-only. Adding a `verified Boolean` column plus an admin verify endpoint would be the natural next step. |
| `receipt.fileName` | Derived from the stored `fileUrl` (basename), not stored separately. |
| Payment deletion | There's no delete-payment endpoint by design — financial records are append-only. The UI's delete action instead surfaces a verify/reject-style status update. |

## Setup (local)

```bash
# 1. Backend
cd oudaa-backend
npm install
cp .env.example .env          # fill in DATABASE_URL + JWT secrets
npx prisma generate
npx prisma migrate dev --name init
npm run seed                  # optional demo data
npm run dev                   # http://localhost:4000

# 2. Frontend (new terminal)
cd oudaa-frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api -> :4000
```

Demo login after seeding (see `oudaa-backend/prisma/seed.js`), password
`Password123!` for both:

- Admin: `admin@greenwood.example`
- Resident: `bob@greenwood.example`

The login screen's "Try the demo" buttons are pre-filled with these
credentials.

### Or, one command with Docker

```bash
docker compose up --build
# then in another terminal, once postgres is healthy:
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

Frontend: http://localhost:5173 · Backend: http://localhost:4000

## Deploying

- **Backend**: any Node host with a PostgreSQL database (Render, Fly.io,
  Railway, ECS, etc.). Set `DATABASE_URL`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, and `CORS_ORIGIN` (your deployed frontend's origin)
  as environment variables. Run `npx prisma migrate deploy` on release.
- **Frontend**: `npm run build` produces `dist/` — deploy as a static site
  (Vercel, Netlify, S3+CloudFront, nginx). Set `VITE_API_URL` at build time
  to your deployed backend's base URL, e.g.
  `https://api.yourdomain.com/api/v1`.
- Uploaded receipts are written to `oudaa-backend/uploads/` on local disk —
  for a deployment behind multiple instances or an ephemeral filesystem
  (most PaaS), swap `config/upload.js` for S3-compatible object storage.
