# Community Fund Management System — Backend API

A multi-tenant SaaS backend for managing community/estate funds: resident dues,
fee collection, payment verification, funds, projects, and expense tracking
with receipts.

**Stack:** Node.js, Express, PostgreSQL, Prisma ORM, JWT auth, Zod validation.

## 1. Architecture

### Multi-tenancy
Every `Community` is a tenant. `User` (ADMIN/RESIDENT) belongs to exactly one
community. Every single query in every controller is filtered by
`communityId` via the `tenantScope` middleware — one tenant can never read or
write another tenant's data. `SUPER_ADMIN` is the platform owner and sits
outside any single tenant (used for platform administration / support).

### Roles
| Role         | Scope                | Can do |
|--------------|-----------------------|--------|
| SUPER_ADMIN  | Platform-wide         | List/inspect all communities (support/ops) |
| ADMIN        | One community         | Manage residents, fees, funds, projects, expenses, verify payments, view reports |
| RESIDENT     | One community, self   | View fees, pay dues, view own payment history, own dashboard |

### Auth
- Register a new tenant: `POST /api/v1/auth/register-community` (creates
  `Community` + first `ADMIN` user in one transaction — this is the SaaS
  signup flow).
- `POST /api/v1/auth/login` — returns a short-lived **access token** (JWT,
  15 min) in the response body, and sets a long-lived **refresh token**
  (7 days) as an httpOnly cookie.
- `POST /api/v1/auth/refresh` — rotates the refresh token and issues a new
  access token. Refresh tokens are stored server-side as SHA-256 hashes only
  (never in plaintext) so a DB leak can't be replayed, and are revoked on use
  (rotation) and on logout.
- `POST /api/v1/auth/logout` — revokes the refresh token.
- Send the access token as `Authorization: Bearer <token>` on every
  protected request.

### Data model
See `prisma/schema.prisma` — mirrors your ER diagram 1:1:
`Community → User → Resident`, `Community → Fee → Payment ← Resident`,
`Community → Fund → Project → Expense → Receipt`.

## 2. Setup

```bash
cd cfms-backend
npm install
cp .env.example .env       # fill in DATABASE_URL and JWT secrets
npx prisma generate
npx prisma migrate dev --name init
npm run seed                # optional: creates a demo community/admin/resident
npm run dev                 # http://localhost:4000
```

Demo login after seeding (password for both: `Password123!`):
- Admin: `admin@greenwood.example`
- Resident: `bob@greenwood.example`

## 3. API overview

All routes are prefixed `/api/v1`. Full route list:

```
POST   /auth/register-community      Sign up a new community (public)
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me                      Current user            [any authed role]

GET    /communities                  All tenants              [SUPER_ADMIN]
GET    /communities/:id                                       [SUPER_ADMIN]
GET    /communities/me/current       My community             [ADMIN]
PATCH  /communities/me/current                                [ADMIN]

POST   /residents                    Register a resident       [ADMIN]
GET    /residents                                             [ADMIN]
GET    /residents/me                 My resident profile       [RESIDENT]
GET    /residents/:id                                          [ADMIN]
PATCH  /residents/:id                                          [ADMIN]
DELETE /residents/:id                                          [ADMIN]

POST   /fees                                                   [ADMIN]
GET    /fees                                                   [ADMIN, RESIDENT]
GET    /fees/:id                                                [ADMIN, RESIDENT]
PATCH  /fees/:id                                                [ADMIN]
DELETE /fees/:id                                                [ADMIN]

POST   /payments                     Pay a fee                  [ADMIN, RESIDENT]
GET    /payments                     (residents see only their own)
GET    /payments/:id
PATCH  /payments/:id/status          Verify/reject payment       [ADMIN]

POST   /funds                                                   [ADMIN]
GET    /funds                                                   [ADMIN, RESIDENT]
GET    /funds/:id
GET    /funds/:id/summary            Allocated vs spent
PATCH  /funds/:id                                               [ADMIN]
DELETE /funds/:id                                                [ADMIN]

POST   /projects                                                 [ADMIN]
GET    /projects                                                 [ADMIN, RESIDENT]
GET    /projects/:id
PATCH  /projects/:id                                              [ADMIN]
DELETE /projects/:id                                              [ADMIN]

POST   /expenses                                                  [ADMIN]
GET    /expenses                                                  [ADMIN, RESIDENT]
GET    /expenses/:id
PATCH  /expenses/:id                                              [ADMIN]
DELETE /expenses/:id                                              [ADMIN]
POST   /expenses/receipts            multipart/form-data upload    [ADMIN]
GET    /expenses/:expenseId/receipts

DELETE /receipts/:id                                               [ADMIN]

GET    /dashboard/admin              KPI summary                  [ADMIN]
GET    /dashboard/resident           My balance/history            [RESIDENT]

GET    /reports/collections?from=&to=   [ADMIN]
GET    /reports/expenses?from=&to=      [ADMIN]
GET    /reports/summary?from=&to=       [ADMIN]
```

## 4. Security notes
- Passwords hashed with bcrypt (cost 12).
- Refresh tokens hashed at rest, rotated on every use, revocable.
- Rate limiting on auth endpoints (20 req / 15 min) and globally (300 req / 15 min).
- Helmet for HTTP security headers, CORS restricted via `CORS_ORIGIN` env var.
- Zod validates and coerces every request body/params/query before it reaches
  a controller.
- File uploads (receipts) restricted to JPEG/PNG/WEBP/PDF, 5MB max.

## 5. What you need to do next
1. Run the two `prisma` commands above against a real Postgres instance
   (this was built and boot-tested in a sandboxed container without internet
   access to Prisma's binary CDN, so the client/migration wasn't generated
   here — that step is standard and will work normally on your machine).
2. Set strong, random values for `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
   in production (e.g. `openssl rand -hex 32`).
3. For production file storage, swap the local-disk Multer storage in
   `src/config/upload.js` for S3/GCS if you'll run multiple instances.
4. Consider adding email verification / password-reset flows, and an
   invite-link flow for residents instead of ADMIN-set passwords, if your
   product needs it.
