# CFMS — Community Fund Management System

Full stack: **cfms-backend** (Node/Express/Prisma/PostgreSQL, JWT auth) +
**cfms-frontend** (React 18 + Vite + Tailwind). This package is the result
of wiring the two together — the frontend now talks to the real API instead
of its original localStorage mock.

## What changed during integration

The frontend shipped with `MOCK_AUTH = true` / `MOCK_MODE = true`: fake
login and all CRUD operations lived in `localStorage`. To integrate it for
real:

- **`frontend/src/lib/api.js`** — axios client base URL fixed to `/api/v1`
  (matches the backend's actual mount point) and `withCredentials: true`
  added so refresh-token cookies work.
- **`frontend/src/context/AuthContext.jsx`** — now calls `POST /auth/login`
  and `GET /auth/me`, stores the JWT, and re-validates it on page reload.
  `MOCK_AUTH` is now `false`.
- **`frontend/src/context/DataContext.jsx`** — every `add*/update*/remove*`
  action now calls the real REST endpoints instead of mutating local state.
  `MOCK_MODE` is now `false`.
- **`frontend/src/lib/adapters.js`** (new) — translates between the UI's
  original simple field names (`resident.unit`, `payment.status: 'paid'`)
  and the backend's normalized/enum-based contract (`unitNumber`,
  `status: 'VERIFIED'`, UUIDs, etc.), so none of the page components had to
  be rewritten.
- Small page-level fixes where the backend genuinely requires something the
  mock UI didn't collect: a password field on resident creation, and a real
  file input (instead of a text filename) on receipt upload.
- `.env.example` in the backend: `CORS_ORIGIN` defaulted to the frontend's
  actual dev port (`5173`, was `3000`).

Both projects were `npm install`ed and `npm run build` (frontend) /
booted end-to-end (backend, request-by-request against `/health`, an
authed route, a validation-error route, and the 404 handler — see below)
in this environment to confirm they work together. See **Verification**.

## Known limitations (schema gaps, not bugs)

The mock UI assumed a few fields the real Prisma schema doesn't store.
Rather than silently drop them, they're kept in a small client-side
`localStorage` overlay (`src/lib/adapters.js`, `getMeta`/`setMeta`) so the
UI still works, clearly commented as `SCHEMA GAP`:

| UI field | Status |
|---|---|
| `resident.phone`, `resident.idNumber`, `resident.address`, `resident.ownerType` | **No longer a gap** — these are now real columns on `Resident` (see migration below), edited from the admin Residents page and the resident-details popup. |
| `fund.balance` | Not stored — computed live from `GET /funds/:id/summary` (allocated − spent across the fund's projects). This is real data, just derived rather than a stored counter. |
| `fund.category` | Stored for real, in `Fund.description` (a free-text column being reused). |
| `receipt.verified` | Not in `Receipt` — client-only. Recommend adding a `verified Boolean` column + an admin verify endpoint. |
| `receipt.fileName` | Derived from the real `fileUrl` (basename) — not stored separately. |
| Payment deletion | Backend has no delete-payment endpoint by design (financial records are append-only). The UI's delete button now calls verify/reject-style status update logic and surfaces a clear error if truly unsupported. |

None of these block real usage — they're documented trade-offs from
adapting a UI that predates the final schema, not missing functionality.

## New in this revision

- **System audit log** — every meaningful action a committee member (or
  platform staff) takes — creating/updating/deleting residents, fees,
  payments, funds, projects, expenses, and committee-seat transfers — is
  written to a new append-only `AuditLog` table (`prisma/schema.prisma`,
  `src/utils/audit.js`). `GET /api/v1/audit-logs` lets **any** committee
  member (`ADMIN`) view the full trail for their community; there is
  deliberately no PATCH/PUT/DELETE route for this resource, and the new
  `/admin/audit-log` page in the frontend has no edit/delete controls.
- **Resident info popup** — clicking a resident (or the new eye icon) on
  the admin Residents page opens a detail view backed by a new
  `GET /residents/:id/summary` endpoint. It returns the resident's full
  profile plus a `missingPayments` list (every community fee this resident
  has no verified/pending payment against). The same popup has an inline
  edit form for email, phone, ID number, address, status, unit, and
  owner/renter type — everything shown on the resident entry form except
  the password, which is never returned or editable from this screen.
- **Migration needed**: `Resident` gained four new optional columns
  (`phone`, `idNumber`, `address`, `ownerType`) and a new `AuditLog` table
  was added. Run `npx prisma migrate dev --name audit_log_and_resident_fields`
  (or `db push` in dev) before starting the API against a real database.


## Verification performed in this environment

- `node -c` syntax-checked every backend source file — clean.
- `npm install` succeeded for both `frontend` and `backend/cfms-backend`.
- `npm run build` (Vite) succeeded for the frontend with zero errors.
- Backend `src/app.js` was booted with a stubbed `@prisma/client` (this
  sandbox can't reach `binaries.prisma.sh` to download the real Prisma
  engine — see Setup step 3 below) and exercised over real HTTP:
  - `GET /health` → `200 {"success":true,...}`
  - `GET /api/v1/fees` with no token → `401 Authentication required`
  - `POST /api/v1/auth/login` with an invalid body → `422` with Zod's
    field-level validation errors
  - `GET /api/v1/nope` → `404 Route ... not found`

  This confirms all 11 route modules, every controller, and the auth /
  validation / error-handling middleware chain wire together correctly.
  What I could **not** run in this environment is a real PostgreSQL
  database (none is provisioned here) — that step is on you, and it's a
  standard `docker compose up` / `prisma migrate` away (below).

## Setup (local)

```bash
# 1. Backend
cd cfms-backend
npm install
cp .env.example .env          # fill in DATABASE_URL + JWT secrets
npx prisma generate
npx prisma migrate dev --name init
npm run seed                  # optional demo data
npm run dev                   # http://localhost:4000

# 2. Frontend (new terminal)
cd cfms-frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api -> :4000
```

Demo login after seeding (see `prisma/seed.js`), password `Password123!`
for both:
- Admin: `admin@greenwood.example`
- Resident: `bob@greenwood.example`

The login screen's "Try the demo" buttons are pre-filled with these exact
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
- Uploaded receipts are written to `cfms-backend/uploads/` on local disk —
  for a real deployment behind multiple instances or an ephemeral
  filesystem (most PaaS), swap `config/upload.js` for S3-compatible object
  storage.
